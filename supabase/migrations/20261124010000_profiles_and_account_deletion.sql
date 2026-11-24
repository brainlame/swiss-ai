-- Names are public attribution; emails and account identifiers remain private.
create table private.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '' check(length(first_name)<=80),
 last_name text not null default '' check(length(last_name)<=80),
 avatar_path text unique
);
create table private.avatar_uploads (
 path text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 mime_type text not null check(mime_type in ('image/png','image/jpeg','image/webp')),
 byte_size bigint not null check(byte_size between 1 and 2097152),
 created_at timestamptz not null default now()
);
create index avatar_uploads_user_idx on private.avatar_uploads(user_id);
alter table private.profiles enable row level security;
alter table private.avatar_uploads enable row level security;
revoke all on private.profiles,private.avatar_uploads from public,anon,authenticated;
-- Delete attribution mappings, not the contributions themselves.
alter table private.case_owners drop constraint case_owners_user_id_fkey,
 add foreign key(user_id) references auth.users(id) on delete cascade;
alter table private.comment_owners drop constraint comment_owners_user_id_fkey,
 add foreign key(user_id) references auth.users(id) on delete cascade;

create function public.my_profile() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('first_name',coalesce(p.first_name,''),'last_name',coalesce(p.last_name,''),'avatar_path',p.avatar_path)
 from (select auth.uid() id) u left join private.profiles p on p.user_id=u.id where u.id is not null;
$$;
create function public.save_profile(p_first text,p_last text,p_avatar text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_first is null or p_last is null or length(private.clean_text(p_first)) not between 1 and 80 or length(private.clean_text(p_last)) not between 1 and 80
 or p_first ~ '[[:cntrl:]]' or p_last ~ '[[:cntrl:]]' then raise exception 'First and last name must each contain 1–80 characters'; end if;
 if p_avatar is not null and not exists(select 1 from private.avatar_uploads a join storage.objects o on o.bucket_id='avatars' and o.name=a.path where a.path=p_avatar and a.user_id=auth.uid()) then raise exception 'Invalid profile picture' using errcode='42501'; end if;
 insert into private.profiles(user_id,first_name,last_name,avatar_path) values(auth.uid(),private.clean_text(p_first),private.clean_text(p_last),p_avatar)
 on conflict(user_id) do update set first_name=excluded.first_name,last_name=excluded.last_name,avatar_path=excluded.avatar_path;
end; $$;
create function public.reserve_avatar(p_mime text,p_size bigint) returns text
language plpgsql security definer set search_path='' as $$
declare path text;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if (select count(*) from private.avatar_uploads where user_id=auth.uid())>=10 then raise exception 'Remove unused profile pictures before retrying'; end if;
 path:=gen_random_uuid()::text||case p_mime when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '.invalid' end;
 insert into private.avatar_uploads values(path,auth.uid(),p_mime,p_size,now()); return path;
end; $$;
create function public.my_avatar_paths() returns setof text language sql stable security definer set search_path='' as $$
 select path from private.avatar_uploads where user_id=auth.uid();
$$;
create function public.prune_avatars() returns void language sql security definer set search_path='' as $$
 delete from private.avatar_uploads a where a.user_id=auth.uid() and not exists(select 1 from storage.objects o where o.bucket_id='avatars' and o.name=a.path);
$$;
create function private.author_identity(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('author',case when p_user is null then 'Deleted user' when coalesce(trim(p.first_name||' '||p.last_name),'')='' then 'Name not set' else trim(p.first_name||' '||p.last_name) end,'avatar_path',p.avatar_path)
 from (select 1) x left join private.profiles p on p.user_id=p_user;
$$;
create function public.case_authors(p_cases uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_cases is null or cardinality(p_cases)>12 then raise exception 'At most 12 issues'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('case_id',c.id)||private.author_identity(o.user_id)) from public.cases c left join private.case_owners o on o.case_id=c.id where c.id=any(p_cases) and (c.status='published' or public.owns_case(c.id) or (c.status='deleting' and public.is_admin()))),'[]'::jsonb);
end; $$;
create or replace function private.comment_json(c public.case_comments) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'parent_id',c.parent_id,'body',c.body,'created_at',c.created_at,'is_deleted',c.is_deleted,
 'can_delete',exists(select 1 from private.comment_owners o where o.comment_id=c.id and o.user_id=auth.uid()),
 'reply_count',(select count(*) from public.case_comments r where r.case_id=c.case_id and r.parent_id=c.id and not r.is_deleted))
 ||private.author_identity((select user_id from private.comment_owners where comment_id=c.id));
$$;
create function public.get_comment(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.comment_json(m) from public.case_comments m join public.cases c on c.id=m.case_id where m.id=p_id and c.status='published';
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,2097152,array['image/png','image/jpeg','image/webp']);
create function public.can_read_avatar(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.profiles where avatar_path=p_path) or exists(select 1 from private.avatar_uploads where path=p_path and user_id=auth.uid());
$$;
create function public.can_write_avatar(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.avatar_uploads a where a.path=p_path and a.user_id=auth.uid());
$$;
create policy avatar_read on storage.objects for select to anon,authenticated using(bucket_id='avatars' and public.can_read_avatar(name));
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and public.can_write_avatar(name));
-- RLS policy cannot query private tables as an app role. Encapsulate that check.
create function public.can_remove_avatar(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_write_avatar(p_path) and not exists(select 1 from private.profiles where avatar_path=p_path);
$$;
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and public.can_remove_avatar(name));

-- Auth admin refuses deletion while a user owns Storage objects. Detach only
-- this application's issue evidence; keep screenshots publicly readable by issue.
create function public.release_account_storage(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id') then
 execute 'update storage.objects s set owner_id=null where bucket_id=''screenshots'' and exists(select 1 from private.uploads u join private.case_owners c on c.case_id=u.case_id where u.path=s.name and c.user_id=$1)' using p_user;
 end if;
 if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner') then
 execute 'update storage.objects s set owner=null where bucket_id=''screenshots'' and exists(select 1 from private.uploads u join private.case_owners c on c.case_id=u.case_id where u.path=s.name and c.user_id=$1)' using p_user;
 end if;
end; $$;
revoke all on function private.author_identity(uuid),public.my_profile(),public.save_profile(text,text,text),public.reserve_avatar(text,bigint),public.my_avatar_paths(),public.prune_avatars(),public.case_authors(uuid[]),public.get_comment(uuid),public.can_read_avatar(text),public.can_write_avatar(text),public.can_remove_avatar(text),public.release_account_storage(uuid) from public,anon,authenticated;
grant execute on function public.my_profile(),public.save_profile(text,text,text),public.reserve_avatar(text,bigint),public.my_avatar_paths(),public.prune_avatars(),public.can_write_avatar(text),public.can_remove_avatar(text) to authenticated;
grant execute on function public.case_authors(uuid[]),public.get_comment(uuid),public.can_read_avatar(text) to anon,authenticated;
grant execute on function public.release_account_storage(uuid) to service_role;
notify pgrst,'reload schema';
