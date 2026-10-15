-- Additive upgrade: existing screenshot cases keep their original evidence requirement.
alter table public.cases
 add column chat_prompt text,
 add column chat_response text,
 add constraint cases_chat_exchange_pair check (
  (chat_prompt is null and chat_response is null) or
  (chat_prompt is not null and chat_response is not null
   and length(private.clean_text(chat_prompt)) between 1 and 10000
   and length(private.clean_text(chat_response)) between 1 and 10000
   and length(chat_prompt)<=10000 and length(chat_response)<=10000)
 );

create function private.protect_chat_exchange() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.chat_prompt is distinct from old.chat_prompt or new.chat_response is distinct from old.chat_response then
  raise exception 'The attached chat exchange is read-only';
 end if;
 return new;
end; $$;
revoke all on function private.protect_chat_exchange() from public,anon,authenticated;
create trigger case_chat_exchange_immutable before update on public.cases
 for each row execute function private.protect_chat_exchange();

-- Defaults preserve existing four-argument callers; remove the old overload to avoid
-- ambiguous PostgREST RPC resolution. Ownership remains bound exclusively to auth.uid().
drop function public.begin_case(uuid,smallint,text,text);
create function public.begin_case(
 p_id uuid,p_constitution smallint,p_description text,p_improvement text,
 p_chat_prompt text default null,p_chat_response text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cases;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into c from public.cases where id=p_id for update;
 if found then
  if not public.owns_case(p_id) then raise exception 'Not authorized'; end if;
  if c.chat_prompt is distinct from p_chat_prompt or c.chat_response is distinct from p_chat_response then
   raise exception 'The attached chat exchange is read-only';
  end if;
  return p_id;
 end if;
 insert into public.cases(id,constitution_number,description,improvement,chat_prompt,chat_response)
  values(p_id,p_constitution,private.clean_text(p_description),private.clean_text(p_improvement),p_chat_prompt,p_chat_response);
 insert into private.case_owners values(p_id,auth.uid());
 return p_id;
end; $$;
revoke execute on function public.begin_case(uuid,smallint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_case(uuid,smallint,text,text,text,text) to authenticated;

create or replace function public.commit_case(p_id uuid,p_version integer,p_constitution smallint,p_description text,p_improvement text,p_paths text[]) returns integer
language plpgsql security definer set search_path='' as $$
declare c public.cases; v_count integer;
begin
 select * into c from public.cases where id=p_id for update;
 if not found or not public.owns_case(p_id) or c.status='deleting' then raise exception 'Not authorized'; end if;
 -- Empty screenshot arrays must also support safe network retries.
 if c.version=p_version+1 and c.description=private.clean_text(p_description) and c.improvement=private.clean_text(p_improvement)
  and c.constitution_number=p_constitution
  and p_paths=coalesce((select array_agg(storage_path order by display_order) from public.case_screenshots where case_id=p_id),array[]::text[])
 then return c.version; end if;
 if c.version<>p_version then raise exception 'This case changed. Reload before saving again.'; end if;
 v_count:=cardinality(p_paths);
 if v_count is null or v_count>5 or v_count<(case when c.chat_prompt is not null and c.chat_response is not null then 0 else 1 end)
  or v_count<>(select count(distinct x) from unnest(p_paths) x)
 then raise exception 'Provide a chat exchange or one to five unique screenshots'; end if;
 if exists(select 1 from unnest(p_paths) x where not exists(
  select 1 from private.uploads u join storage.objects o on o.bucket_id='screenshots' and o.name=u.path
  where u.path=x and u.case_id=p_id and not u.cleanup_claimed and (o.metadata->>'size')::bigint=u.byte_size and o.metadata->>'mimetype'=u.mime_type
 )) then raise exception 'Screenshots have not finished uploading or are invalid'; end if;
 delete from public.case_screenshots where case_id=p_id;
 insert into public.case_screenshots(case_id,storage_path,display_order)
  select p_id,x,(n-1)::smallint from unnest(p_paths) with ordinality as a(x,n);
 update public.cases set constitution_number=p_constitution,description=private.clean_text(p_description),improvement=private.clean_text(p_improvement),status='published',version=version+1,
  created_at=case when c.status='draft' then now() else created_at end,updated_at=now() where id=p_id;
 return c.version+1;
end; $$;
-- CREATE OR REPLACE retains the restricted grants on commit_case from the initial migration.
notify pgrst, 'reload schema';
