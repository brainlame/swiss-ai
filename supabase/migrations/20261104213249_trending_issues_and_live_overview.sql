-- Public upvote totals are cached transactionally; individual ballots stay private.
alter table public.cases add column upvotes bigint not null default 0 check(upvotes>=0);
update public.cases c set upvotes=(select count(*) from private.case_votes v where v.case_id=c.id and v.value=1);
create index cases_trending_idx on public.cases(upvotes desc,created_at desc,id desc) where status='published';
create index cases_constitution_trending_idx on public.cases(constitution_number,upvotes desc,created_at desc,id desc) where status='published';

-- The only replicated payload is this identity-free invalidation signal.
create table public.issue_feed_state (
 id smallint primary key check(id=1),
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now()
);
insert into public.issue_feed_state(id) values(1);
alter table public.issue_feed_state enable row level security;
revoke all on public.issue_feed_state from public,anon,authenticated;
grant select on public.issue_feed_state to anon,authenticated;
create policy issue_feed_state_read on public.issue_feed_state for select to anon,authenticated using(true);

create function private.signal_issue_feed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (tg_op<>'INSERT' and old.status='published') or (tg_op<>'DELETE' and new.status='published') then
  update public.issue_feed_state set revision=revision+1,updated_at=clock_timestamp() where id=1;
 end if;
 return null;
end; $$;
create trigger case_feed_changed after insert or update or delete on public.cases
for each row execute function private.signal_issue_feed();

create function private.count_case_upvotes() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_up integer:=0; new_up integer:=0;
begin
 if tg_op<>'INSERT' and old.value=1 then old_up:=1; end if;
 if tg_op<>'DELETE' and new.value=1 then new_up:=1; end if;
 if tg_op='UPDATE' and old.case_id=new.case_id then
  if new_up<>old_up then update public.cases set upvotes=upvotes+new_up-old_up where id=new.case_id; end if;
 else
  if old_up=1 then update public.cases set upvotes=upvotes-1 where id=old.case_id; end if;
  if new_up=1 then update public.cases set upvotes=upvotes+1 where id=new.case_id; end if;
 end if;
 return null;
end; $$;
create trigger case_upvotes_changed after insert or update or delete on private.case_votes
for each row execute function private.count_case_upvotes();
revoke all on function private.signal_issue_feed(),private.count_case_upvotes() from public,anon,authenticated;

-- Serialize each case's ballots before the counter write, avoiding SHARE-lock upgrades.
create or replace function public.vote_case(p_case uuid,p_value smallint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Invalid vote'; end if;
 perform 1 from public.cases where id=p_case and status='published' for update;
 if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 if p_value=0 then delete from private.case_votes where case_id=p_case and user_id=auth.uid();
 else insert into private.case_votes(case_id,user_id,value) values(p_case,auth.uid(),p_value)
 on conflict(case_id,user_id) do update set value=excluded.value; end if;
end; $$;
revoke all on function public.vote_case(uuid,smallint) from public,anon,authenticated;
grant execute on function public.vote_case(uuid,smallint) to authenticated;

-- Every page is bounded to ten plus a look-ahead row. Revisions reject stale cursors.
-- SECURITY INVOKER retains normal public-case RLS; no ownership columns are selected.
create function public.browse_trending_issues(
 p_search text default '',p_constitution integer default null,
 p_upvotes bigint default null,p_time timestamptz default null,p_id uuid default null,p_revision bigint default null
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
 return jsonb_build_object('revision',current_revision::text,'items',coalesce((
  select jsonb_agg(to_jsonb(c) order by c.upvotes desc,c.created_at desc,c.id desc) from (
   select id,constitution_number,left(description,600) as description,left(improvement,300) as improvement,
    created_at,updated_at,status,version,behavior,upvotes
   from public.cases where status='published'
    and (p_constitution is null or constitution_number=p_constitution)
    and (coalesce(p_search,'')='' or (description||' '||improvement) ilike '%'||replace(replace(replace(left(p_search,200),'\','\\'),'%','\%'),'_','\_')||'%')
    and (p_upvotes is null or (upvotes,created_at,id)<(p_upvotes,p_time,p_id))
   order by upvotes desc,created_at desc,id desc limit 11
  ) c
 ),'[]'::jsonb));
end; $$;

create function public.issue_overview() returns jsonb
language sql stable security invoker set search_path='' as $$
 with counts as (
  select constitution_number,behavior,count(*) as n,sum(upvotes) as votes from public.cases
  where status='published' group by constitution_number,behavior
 )
 select jsonb_build_object(
  'revision',(select revision::text from public.issue_feed_state where id=1),
  'total',coalesce((select sum(n) from counts),0),
  'upvotes',coalesce((select sum(votes) from counts),0),
  'behaviors',jsonb_build_object(
   'good',coalesce((select sum(n) from counts where behavior='good'),0),
   'bad',coalesce((select sum(n) from counts where behavior='bad'),0),
   'unclassified',coalesce((select sum(n) from counts where behavior is null),0)),
  'constitutions',(select jsonb_agg(jsonb_build_object('number',c.number,'count',coalesce(t.n,0)) order by c.number)
   from public.constitutions c left join (select constitution_number,sum(n) as n from counts group by constitution_number) t on t.constitution_number=c.number)
 );
$$;
revoke all on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint),public.issue_overview() from public,anon,authenticated;
grant execute on function public.browse_trending_issues(text,integer,bigint,timestamptz,uuid,bigint),public.issue_overview() to anon,authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and
  not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='issue_feed_state') then
  alter publication supabase_realtime add table public.issue_feed_state;
 end if;
end; $$;
notify pgrst,'reload schema';
