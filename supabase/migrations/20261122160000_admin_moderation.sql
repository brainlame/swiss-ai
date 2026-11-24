-- Membership is managed only through a trusted database connection.
create table private.admin_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now()
);
alter table private.admin_members enable row level security;
revoke all on private.admin_members from public, anon, authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from private.admin_members where user_id=auth.uid()
 );
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Per-issue aggregates are available only through guarded functions.
revoke select on public.cases from public, anon, authenticated;
grant select(id,constitution_number,description,improvement,transcript,behavior,
 chat_prompt,chat_response,status,created_at,updated_at,version,is_sample)
 on public.cases to anon,authenticated;

-- Keep the established RPC shape while moving unrestricted aggregation private.
alter function public.case_discussions(uuid[]) rename to raw_case_discussions;
alter function public.raw_case_discussions(uuid[]) set schema private;
revoke all on function private.raw_case_discussions(uuid[]) from public,anon,authenticated;
create function public.case_discussions(p_cases uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item jsonb; result jsonb:='[]'; visible boolean;
begin
 for item in select value from jsonb_array_elements(private.raw_case_discussions(p_cases)) loop
  visible:=public.is_admin() or (item->>'my_vote')::integer<>0;
  item:=item||jsonb_build_object(
   'can_view_results',visible,
   'total_votes',(item->>'upvotes')::bigint+(item->>'downvotes')::bigint,
   'total_comments',(item->>'comment_count')::bigint+
    (item#>>'{threads,wanted,comment_count}')::bigint+
    (item#>>'{threads,unwanted,comment_count}')::bigint);
  if not visible then item:=item||jsonb_build_object('upvotes',0,'downvotes',0); end if;
  result:=result||jsonb_build_array(item);
 end loop;
 return result;
end; $$;
revoke all on function public.case_discussions(uuid[]) from public,anon,authenticated;
grant execute on function public.case_discussions(uuid[]) to anon,authenticated;

-- Preserve existing date-based callers, but mask counter/baseline columns.
alter function public.browse_cases(text,integer,boolean,timestamptz,uuid,boolean) rename to raw_browse_cases;
alter function public.raw_browse_cases(text,integer,boolean,timestamptz,uuid,boolean) set schema private;
revoke all on function private.raw_browse_cases(text,integer,boolean,timestamptz,uuid,boolean) from public,anon,authenticated;
create function public.browse_cases(
 p_search text default '',p_constitution integer default null,p_oldest boolean default false,
 p_time timestamptz default null,p_id uuid default null,p_mine boolean default false
) returns setof public.cases language sql stable security definer set search_path='' as $$
 select (jsonb_populate_record(null::public.cases,to_jsonb(c)||jsonb_build_object(
  'upvotes',case when public.is_admin() or exists(select 1 from private.case_votes v where v.case_id=c.id and v.user_id=auth.uid()) then c.upvotes else 0 end,
  'sample_wanted_votes',0,'sample_unwanted_votes',0))).*
 from private.raw_browse_cases(p_search,p_constitution,p_oldest,p_time,p_id,p_mine) c;
$$;
revoke all on function public.browse_cases(text,integer,boolean,timestamptz,uuid,boolean) from public,anon,authenticated;
grant execute on function public.browse_cases(text,integer,boolean,timestamptz,uuid,boolean) to anon,authenticated;

-- The current ranked feed has no counter columns. Guard the older RPC as well.
alter function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) rename to raw_browse_trending_issues;
alter function public.raw_browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) set schema private;
revoke all on function private.raw_browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) from public,anon,authenticated;
create function public.browse_trending_issues(
 p_search text default '',p_constitution integer default null,p_upvotes bigint default null,
 p_time timestamptz default null,p_id uuid default null,p_revision bigint default null,p_topic text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.raw_browse_trending_issues(p_search,p_constitution,p_upvotes,p_time,p_id,p_revision,p_topic);
 -- A user-supplied vote threshold could otherwise be used to infer hidden counts.
 if p_upvotes is not null and not public.is_admin() then
  raise exception 'Use browse_ranked_issues for pagination' using errcode='42501';
 end if;
 return jsonb_set(result,'{items}',coalesce((
  select jsonb_agg(item||jsonb_build_object('upvotes',
   case when public.is_admin() or exists(select 1 from private.case_votes v
    where v.case_id=(item->>'id')::uuid and v.user_id=auth.uid())
    then (item->>'upvotes')::bigint else 0 end) order by n)
  from jsonb_array_elements(result->'items') with ordinality a(item,n)
 ),'[]'::jsonb));
end; $$;
revoke all on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) to anon,authenticated;
-- Raw legacy query needs definer rights after column grants are narrowed.
alter function private.raw_browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text) security definer;

alter function public.issue_overview() rename to raw_issue_overview;
alter function public.raw_issue_overview() set schema private;
alter function private.raw_issue_overview() security definer;
revoke all on function private.raw_issue_overview() from public,anon,authenticated;
create function public.issue_overview() returns jsonb
language sql stable security definer set search_path='' as $$
 select private.raw_issue_overview()||case when public.is_admin() then '{}'::jsonb else '{"upvotes":0}'::jsonb end;
$$;
revoke all on function public.issue_overview() from public,anon,authenticated;
grant execute on function public.issue_overview() to anon,authenticated;

-- Admins may retry deletion of a hidden issue, while drafts stay owner-only.
create policy admin_deleting_case_read on public.cases for select to authenticated
 using(status='deleting' and public.is_admin());

create or replace function public.begin_delete(p_id uuid) returns setof text
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.owns_case(p_id) or public.is_admin()) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 perform 1 from public.cases where id=p_id for update;
 if not found then return; end if;
 if not public.owns_case(p_id) and exists(select 1 from public.cases where id=p_id and status='draft') then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 update public.cases set status='deleting' where id=p_id;
 return query select path from private.uploads where case_id=p_id;
end; $$;

create or replace function public.finish_delete(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (public.owns_case(p_id) or public.is_admin()) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 perform 1 from public.cases where id=p_id for update;
 if not found then return; end if;
 if exists(select 1 from storage.objects o join private.uploads u on u.path=o.name
  where o.bucket_id='screenshots' and u.case_id=p_id) then
  raise exception 'Image cleanup incomplete. Retry deletion.';
 end if;
 delete from public.cases where id=p_id and status='deleting';
end; $$;

create or replace function public.can_read_image(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.uploads u join public.cases c on c.id=u.case_id
  where u.path=p_path and (
   public.owns_case(c.id) or (public.is_admin() and c.status='deleting') or
   (c.status='published' and exists(select 1 from public.case_screenshots s where s.storage_path=p_path))
  ));
$$;
create or replace function public.can_delete_image(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.uploads u join public.cases c on c.id=u.case_id
  where u.path=p_path and (
   (public.owns_case(c.id) and (c.status='deleting' or not exists(select 1 from public.case_screenshots s where s.storage_path=p_path)))
   or (public.is_admin() and c.status='deleting')
  ));
$$;
notify pgrst,'reload schema';
