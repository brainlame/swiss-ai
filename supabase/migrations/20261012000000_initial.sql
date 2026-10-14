-- Authoritative schema. Public records never contain an Auth user identifier.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create extension if not exists pg_trgm with schema extensions;
-- Match JavaScript trim at the database boundary, including Unicode whitespace.
create function private.clean_text(value text) returns text language sql immutable strict set search_path='' as $$
 select btrim(value, E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;
revoke all on function private.clean_text(text) from public,anon,authenticated;
create table public.constitutions (
 number smallint primary key check(number between 1 and 11),
 text text not null check(length(private.clean_text(text)) > 0), is_sample boolean not null default true
);
create table public.cases (
 id uuid primary key default gen_random_uuid(), constitution_number smallint references public.constitutions(number) not null,
 description text not null check(length(private.clean_text(description)) between 1 and 10000),
 improvement text not null check(length(private.clean_text(improvement)) between 1 and 10000),
 status text not null default 'draft' check(status in ('draft','published','deleting')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version integer not null default 1
);
create table private.case_owners (
 case_id uuid primary key references public.cases(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict
);
create index case_owners_user_idx on private.case_owners(user_id,case_id);
create table private.uploads (
 path text primary key, case_id uuid not null references public.cases(id) on delete cascade,
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 10485760),
 created_at timestamptz not null default now(), cleanup_claimed boolean not null default false
);
create index uploads_case_idx on private.uploads(case_id);
create table public.case_screenshots (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references public.cases(id) on delete cascade,
 storage_path text not null unique references private.uploads(path), display_order smallint not null check(display_order between 0 and 4),
 unique(case_id,display_order)
);
create index cases_browse_idx on public.cases(created_at,id) where status='published';
create index cases_constitution_idx on public.cases(constitution_number,created_at,id) where status='published';
create index cases_search_idx on public.cases using gin ((description || ' ' || improvement) extensions.gin_trgm_ops) where status='published';
alter table public.constitutions enable row level security;
alter table public.cases enable row level security;
alter table public.case_screenshots enable row level security;
alter table private.case_owners enable row level security;
alter table private.uploads enable row level security;
revoke all on public.constitutions,public.cases,public.case_screenshots from anon,authenticated;
revoke all on private.case_owners,private.uploads from public,anon,authenticated;
grant select on public.constitutions,public.cases,public.case_screenshots to anon,authenticated;

create function public.owns_case(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.case_owners where case_id=p_id and user_id=(select auth.uid()));
$$;
create policy constitution_read on public.constitutions for select to anon,authenticated using(true);
create policy case_read on public.cases for select to anon,authenticated using(status='published' or public.owns_case(id));
create policy screenshot_read on public.case_screenshots for select to anon,authenticated using(exists(select 1 from public.cases c where c.id=case_id));

create function public.begin_case(p_id uuid,p_constitution smallint,p_description text,p_improvement text) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from public.cases where id=p_id) then
  if not public.owns_case(p_id) then raise exception 'Not authorized'; end if;
  return p_id;
 end if;
 insert into public.cases(id,constitution_number,description,improvement) values(p_id,p_constitution,private.clean_text(p_description),private.clean_text(p_improvement));
 insert into private.case_owners values(p_id,auth.uid());
 return p_id;
end; $$;
create function public.reserve_upload(p_case uuid,p_mime text,p_size bigint) returns text
language plpgsql security definer set search_path='' as $$
declare v_path text;
begin
 perform 1 from public.cases where id=p_case and status<>'deleting' for update;
 if not found or not public.owns_case(p_case) then raise exception 'Not authorized'; end if;
 if (select count(*) from private.uploads u where case_id=p_case and not exists(select 1 from public.case_screenshots s where s.storage_path=u.path)) >= 10 then raise exception 'Too many pending uploads. Retry cleanup before uploading.'; end if;
 v_path:=p_case::text||'/'||gen_random_uuid()::text||case p_mime when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '.invalid' end;
 insert into private.uploads(path,case_id,mime_type,byte_size) values(v_path,p_case,p_mime,p_size);
 return v_path;
end; $$;
create function public.commit_case(p_id uuid,p_version integer,p_constitution smallint,p_description text,p_improvement text,p_paths text[]) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.cases; v_count integer;
begin
 select * into c from public.cases where id=p_id for update;
 if not found or not public.owns_case(p_id) or c.status='deleting' then raise exception 'Not authorized'; end if;
 -- A network retry of an already-committed request is safe and idempotent.
 if c.version=p_version+1 and c.description=private.clean_text(p_description) and c.improvement=private.clean_text(p_improvement) and c.constitution_number=p_constitution and p_paths=(select array_agg(storage_path order by display_order) from public.case_screenshots where case_id=p_id) then return c.version; end if;
 if c.version<>p_version then raise exception 'This case changed. Reload before saving again.'; end if;
 v_count:=cardinality(p_paths);
 if v_count is null or v_count not between 1 and 5 or v_count<>(select count(distinct x) from unnest(p_paths) x) then raise exception 'Choose one to five unique screenshots'; end if;
 if exists(select 1 from unnest(p_paths) x where not exists(
  select 1 from private.uploads u join storage.objects o on o.bucket_id='screenshots' and o.name=u.path
  where u.path=x and u.case_id=p_id and not u.cleanup_claimed and (o.metadata->>'size')::bigint=u.byte_size and o.metadata->>'mimetype'=u.mime_type
 )) then raise exception 'Screenshots have not finished uploading or are invalid'; end if;
 delete from public.case_screenshots where case_id=p_id;
 insert into public.case_screenshots(case_id,storage_path,display_order) select p_id,x,(n-1)::smallint from unnest(p_paths) with ordinality as a(x,n);
 update public.cases set constitution_number=p_constitution,description=private.clean_text(p_description),improvement=private.clean_text(p_improvement),status='published',version=version+1,
 created_at=case when c.status='draft' then now() else created_at end,updated_at=now() where id=p_id;
 return c.version+1;
end; $$;
create function public.pending_paths(p_case uuid) returns setof text language plpgsql security definer set search_path='' as $$
begin
 if not public.owns_case(p_case) then raise exception 'Not authorized'; end if;
 return query select u.path from private.uploads u join public.cases c on c.id=u.case_id where u.case_id=p_case and (c.status='deleting' or not exists(select 1 from public.case_screenshots s where s.storage_path=u.path));
end; $$;
create function public.begin_delete(p_id uuid) returns setof text language plpgsql security definer set search_path='' as $$
begin
 if not public.owns_case(p_id) then raise exception 'Not authorized'; end if;
 update public.cases set status='deleting' where id=p_id;
 return query select path from private.uploads where case_id=p_id;
end; $$;
create function public.finish_delete(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.owns_case(p_id) then raise exception 'Not authorized'; end if;
 if exists(select 1 from storage.objects o join private.uploads u on u.path=o.name where o.bucket_id='screenshots' and u.case_id=p_id) then raise exception 'Image cleanup incomplete. Retry deletion.'; end if;
 delete from public.cases where id=p_id and status='deleting';
end; $$;
create function public.prune_uploads(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.owns_case(p_id) then raise exception 'Not authorized'; end if;
 delete from private.uploads u where case_id=p_id and not exists(select 1 from public.case_screenshots s where s.storage_path=u.path) and not exists(select 1 from storage.objects o where o.bucket_id='screenshots' and o.name=u.path);
end; $$;
create function public.browse_cases(p_search text default '',p_constitution integer default null,p_oldest boolean default false,p_time timestamptz default null,p_id uuid default null,p_mine boolean default false)
returns setof public.cases language plpgsql stable security definer set search_path='' as $$
begin
 if p_mine and auth.uid() is null then raise exception 'Sign in required'; end if;
 return query select c.* from public.cases c where
 (case when p_mine then public.owns_case(c.id) and c.status<>'draft' else c.status='published' end)
 and (p_constitution is null or c.constitution_number=p_constitution)
 and (coalesce(p_search,'')='' or (c.description||' '||c.improvement) ilike '%'||replace(replace(replace(left(p_search,200),'\','\\'),'%','\%'),'_','\_')||'%')
 and (p_time is null or (case when p_oldest then (c.created_at,c.id)>(p_time,p_id) else (c.created_at,c.id)<(p_time,p_id) end))
 order by case when p_oldest then c.created_at end asc,case when p_oldest then c.id end asc,case when not p_oldest then c.created_at end desc,case when not p_oldest then c.id end desc limit 13;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('screenshots','screenshots',false,10485760,array['image/png','image/jpeg','image/webp']);
create function public.can_upload(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.uploads u join public.cases c on c.id=u.case_id where u.path=p_path and not u.cleanup_claimed and c.status<>'deleting' and public.owns_case(c.id) and not exists(select 1 from public.case_screenshots s where s.storage_path=p_path));
$$;
create function public.can_read_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.uploads u join public.cases c on c.id=u.case_id where u.path=p_path and (public.owns_case(c.id) or (c.status='published' and exists(select 1 from public.case_screenshots s where s.storage_path=p_path))));
$$;
create function public.can_delete_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.uploads u join public.cases c on c.id=u.case_id where u.path=p_path and public.owns_case(c.id) and (c.status='deleting' or not exists(select 1 from public.case_screenshots s where s.storage_path=p_path)));
$$;
create policy screenshot_insert on storage.objects for insert to authenticated with check(bucket_id='screenshots' and public.can_upload(name));
create policy screenshot_select on storage.objects for select to anon,authenticated using(bucket_id='screenshots' and public.can_read_image(name));
create policy screenshot_delete on storage.objects for delete to authenticated using(bucket_id='screenshots' and public.can_delete_image(name));
-- No UPDATE policy: evidence paths are immutable. Upload replacements to new random paths.

-- Housekeeping is service-role-only and cannot disclose paths to ordinary users.
create function public.cleanup_candidates() returns setof text language plpgsql security definer set search_path='' as $$
declare v_case uuid;
begin
 -- Serialize with commit_case: once claimed, an old upload cannot be published.
 for v_case in select c.id from public.cases c where c.status='deleting' or exists(select 1 from private.uploads u where u.case_id=c.id and u.created_at<now()-interval '24 hours' and not exists(select 1 from public.case_screenshots s where s.storage_path=u.path)) order by c.created_at limit 40 for update skip locked loop
  return query update private.uploads u set cleanup_claimed=true where u.case_id=v_case and (exists(select 1 from public.cases c where c.id=v_case and c.status='deleting') or (u.created_at<now()-interval '24 hours' and not exists(select 1 from public.case_screenshots s where s.storage_path=u.path))) returning u.path;
 end loop;
end; $$;
create function public.finish_cleanup() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.uploads u where not exists(select 1 from public.case_screenshots s where s.storage_path=u.path) and not exists(select 1 from storage.objects o where o.bucket_id='screenshots' and o.name=u.path) and u.created_at<now()-interval '24 hours';
 delete from public.cases c where (status='deleting' or (status='draft' and created_at<now()-interval '24 hours')) and not exists(select 1 from storage.objects o join private.uploads u on u.path=o.name where o.bucket_id='screenshots' and u.case_id=c.id);
end; $$;
-- Explicitly revoke default function execution (including public's implicit grant).
revoke execute on function public.owns_case(uuid),public.begin_case(uuid,smallint,text,text),public.reserve_upload(uuid,text,bigint),public.commit_case(uuid,integer,smallint,text,text,text[]),public.pending_paths(uuid),public.begin_delete(uuid),public.finish_delete(uuid),public.prune_uploads(uuid),public.browse_cases(text,integer,boolean,timestamptz,uuid,boolean),public.can_upload(text),public.can_read_image(text),public.can_delete_image(text),public.cleanup_candidates(),public.finish_cleanup() from public,anon,authenticated;
grant execute on function public.owns_case(uuid),public.browse_cases(text,integer,boolean,timestamptz,uuid,boolean),public.can_read_image(text) to anon,authenticated;
grant execute on function public.begin_case(uuid,smallint,text,text),public.reserve_upload(uuid,text,bigint),public.commit_case(uuid,integer,smallint,text,text,text[]),public.pending_paths(uuid),public.begin_delete(uuid),public.finish_delete(uuid),public.prune_uploads(uuid),public.can_upload(text),public.can_delete_image(text) to authenticated;
grant execute on function public.cleanup_candidates(),public.finish_cleanup() to service_role;

insert into public.constitutions(number,text) values
(1,'Help people pursue worthwhile goals with clear, useful, and context-sensitive assistance.'),
(2,'Be honest about facts, uncertainty, capabilities, and mistakes.'),
(3,'Protect personal information and use only the data necessary to help.'),
(4,'Treat people fairly and respectfully across backgrounds, identities, and circumstances.'),
(5,'Avoid enabling harm, exploitation, or unauthorized access to people and systems.'),
(6,'Support human autonomy by explaining options without manipulation or coercion.'),
(7,'Respond to vulnerability with care and encourage appropriate human support.'),
(8,'Distinguish evidence from opinion and represent reasonable perspectives accurately.'),
(9,'Respect creative work and give appropriate credit to its sources.'),
(10,'Adapt assistance to the person while preserving consistent ethical commitments.'),
(11,'Welcome correction and improve through accountable reflection on real-world outcomes.');
