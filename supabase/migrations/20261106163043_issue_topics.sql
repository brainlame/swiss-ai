-- The job replaces these tables in one transaction. Browsers have read-only access.
create table public.issue_topics (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(id) <= 60 and id <> 'unclassified'),
  name text not null unique check (length(name) between 3 and 60)
);
create table public.issue_topic_assignments (
  issue_id uuid primary key references public.cases(id) on delete cascade,
  topic_id text not null references public.issue_topics(id) on delete cascade
);
create index issue_topic_assignments_topic_idx on public.issue_topic_assignments(topic_id);

alter table public.issue_topics enable row level security;
alter table public.issue_topic_assignments enable row level security;
revoke all on public.issue_topics, public.issue_topic_assignments from public, anon, authenticated;
grant select on public.issue_topics, public.issue_topic_assignments to anon, authenticated;
create policy issue_topics_read on public.issue_topics for select to anon, authenticated using (true);
create policy issue_topic_assignments_read on public.issue_topic_assignments for select to anon, authenticated
  using (exists (select 1 from public.cases c where c.id=issue_id and c.status='published'));

drop function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint);
create or replace function public.browse_trending_issues(
 p_search text default '',p_constitution integer default null,
 p_upvotes bigint default null,p_time timestamptz default null,p_id uuid default null,p_revision bigint default null, p_topic text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare current_revision bigint;
begin
 if num_nonnulls(p_upvotes,p_time,p_id,p_revision) not in (0,4) or p_upvotes<0 or p_revision<0 then
  raise exception 'Invalid ranking cursor' using errcode='22023';
 end if;
 select revision into current_revision from public.issue_feed_state where id=1;
 if p_revision is not null and p_revision<>current_revision then
  raise exception 'Issues have changed. Refresh the ranking to load more.' using errcode='40001';
 end if;
 return jsonb_build_object(
  'revision', current_revision::text,
  'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
    from public.issue_topics t), '[]'::jsonb),
  'has_unclassified', exists(select 1 from public.cases c where c.status='published'
    and not exists(select 1 from public.issue_topic_assignments a where a.issue_id=c.id)),
  'items', coalesce((
  select jsonb_agg(to_jsonb(c) order by c.upvotes desc,c.created_at desc,c.id desc) from (
   select id,constitution_number,left(description,600) as description,left(improvement,300) as improvement,
    created_at,updated_at,status,version,behavior,upvotes,is_sample
   from public.cases where status='published'
    and (p_topic is null or
      case when p_topic='unclassified' then not exists (
        select 1 from public.issue_topic_assignments a where a.issue_id=cases.id
      ) else exists (
        select 1 from public.issue_topic_assignments a where a.issue_id=cases.id and a.topic_id=p_topic
      ) end)
    and (p_constitution is null or constitution_number=p_constitution)
    and (coalesce(p_search,'')='' or (description||' '||improvement) ilike '%'||replace(replace(replace(left(p_search,200),'\','\\'),'%','\%'),'_','\_')||'%')
    and (p_upvotes is null or (upvotes,created_at,id)<(p_upvotes,p_time,p_id))
   order by upvotes desc,created_at desc,id desc limit 11
  ) c
 ),'[]'::jsonb));
end; $$;

revoke all on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text)
  from public, anon, authenticated;
grant execute on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint,text)
  to anon, authenticated;

notify pgrst,'reload schema';
