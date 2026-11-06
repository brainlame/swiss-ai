-- Archive the previous usefulness ballots before accepting behavior ballots.
create table private.legacy_case_votes (
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null,
  primary key (case_id, user_id)
);
create index legacy_case_votes_user_idx on private.legacy_case_votes(user_id);
alter table private.legacy_case_votes enable row level security;
revoke all on private.legacy_case_votes from public, anon, authenticated;

-- Sample totals are explicit baselines. Only actual ballots have a voter.
alter table public.cases
  add column is_sample boolean not null default false,
  add column sample_wanted_votes integer not null default 0 check (sample_wanted_votes >= 0),
  add column sample_unwanted_votes integer not null default 0 check (sample_unwanted_votes >= 0),
  add constraint sample_case_vote_totals check (
    (is_sample or (sample_wanted_votes = 0 and sample_unwanted_votes = 0))
    and upvotes >= sample_wanted_votes
  );

-- The ALTER TABLE above holds the case lock until the migration commits.
with archived as (
  delete from private.case_votes returning case_id, user_id, value, created_at
)
insert into private.legacy_case_votes select * from archived;

-- Existing messages stay in their original discussion. New reasons identify a side.
alter table public.case_comments
  add column stance text not null default 'general' check (stance in ('general', 'wanted', 'unwanted')),
  add unique (case_id, id, stance),
  drop constraint case_comments_case_id_parent_id_fkey,
  add foreign key (case_id, parent_id, stance) references public.case_comments(case_id, id, stance);
create index case_comments_stance_page_idx on public.case_comments(case_id, stance, parent_id, created_at, id);

create function private.case_comment_summary(p_case uuid, p_stance text) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object(
    'comment_count', (select count(*) from public.case_comments m
      where m.case_id=p_case and m.stance=p_stance and not m.is_deleted),
    'root_count', (select count(*) from public.case_comments m
      where m.case_id=p_case and m.stance=p_stance and m.parent_id is null
        and (not m.is_deleted or exists(select 1 from public.case_comments r
          where r.case_id=m.case_id and r.parent_id=m.id and r.stance=p_stance and not r.is_deleted))),
    'preview', coalesce((select jsonb_agg(private.comment_json(p) order by p.created_at desc, p.id desc)
      from (
        select m.* from public.case_comments m
        where m.case_id=p_case and m.stance=p_stance and m.parent_id is null
          and (not m.is_deleted or exists(select 1 from public.case_comments r
            where r.case_id=m.case_id and r.parent_id=m.id and r.stance=p_stance and not r.is_deleted))
        order by m.created_at desc, m.id desc limit 2
      ) p), '[]'::jsonb)
  );
$$;
revoke all on function private.case_comment_summary(uuid,text) from public,anon,authenticated;

create or replace function public.case_discussions(p_cases uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_cases is null or cardinality(p_cases)>12 then raise exception 'Request at most 12 cases'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'case_id', c.id,
      'upvotes', c.upvotes,
      'downvotes', c.sample_unwanted_votes + (select count(*) from private.case_votes v where v.case_id=c.id and v.value=-1),
      'my_vote', coalesce((select v.value from private.case_votes v where v.case_id=c.id and v.user_id=auth.uid()), 0),
      'threads', jsonb_build_object(
        'wanted', private.case_comment_summary(c.id, 'wanted'),
        'unwanted', private.case_comment_summary(c.id, 'unwanted')
      )
    ) || private.case_comment_summary(c.id, 'general'))
    from public.cases c where c.id=any(p_cases) and c.status='published'
  ), '[]'::jsonb);
end; $$;

drop function public.discussion_comments(uuid,uuid,timestamptz,uuid);
drop function public.post_case_comment(uuid,uuid,text,uuid);
create function public.discussion_comments(p_case uuid,p_parent uuid default null,p_time timestamptz default null,p_id uuid default null,p_stance text default 'general')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page jsonb;
begin
 if not exists(select 1 from public.cases where id=p_case and status='published') then raise exception 'Case not found' using errcode='P0002'; end if;
 if p_stance is null or p_stance not in ('general','wanted','unwanted') then raise exception 'Invalid discussion side'; end if;
 if (p_time is null)<>(p_id is null) then raise exception 'Invalid cursor'; end if;
 if p_parent is not null and not exists(select 1 from public.case_comments where id=p_parent and case_id=p_case and stance=p_stance and parent_id is null) then raise exception 'Thread not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(private.comment_json(p) order by
  case when p_parent is null then p.created_at end desc,case when p_parent is null then p.id end desc,
  case when p_parent is not null then p.created_at end asc,case when p_parent is not null then p.id end asc),'[]'::jsonb) into page from (
  select m.* from public.case_comments m where m.case_id=p_case and m.stance=p_stance and m.parent_id is not distinct from p_parent
   and (not m.is_deleted or (p_parent is null and exists(select 1 from public.case_comments r where r.case_id=m.case_id and r.parent_id=m.id and r.stance=p_stance and not r.is_deleted)))
   and (p_time is null or (case when p_parent is null then (m.created_at,m.id)<(p_time,p_id) else (m.created_at,m.id)>(p_time,p_id) end))
  order by case when p_parent is null then m.created_at end desc,case when p_parent is null then m.id end desc,
   case when p_parent is not null then m.created_at end asc,case when p_parent is not null then m.id end asc limit 11
 ) p;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by n),'[]'::jsonb) from jsonb_array_elements(page) with ordinality a(value,n) where n<=10), 'has_more',jsonb_array_length(page)>10);
end; $$;

create function public.post_case_comment(p_case uuid,p_id uuid,p_body text,p_parent uuid default null,p_stance text default 'general') returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.case_comments;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_stance is null or p_stance not in ('general','wanted','unwanted') then raise exception 'Invalid discussion side'; end if;
 if p_id is null or p_body is null or length(p_body)>2000 or length(private.clean_text(p_body))<1 then raise exception 'Write a comment of 1–2,000 characters'; end if;
 perform 1 from public.cases where id=p_case and status='published' for share;
 if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.case_comments where id=p_id;
 if found then
  if not exists(select 1 from private.comment_owners where comment_id=p_id and user_id=auth.uid())
   or existing.stance<>p_stance or existing.case_id<>p_case or existing.parent_id is distinct from p_parent
   or existing.body<>private.clean_text(p_body) or existing.is_deleted then raise exception 'Comment ID already used' using errcode='42501'; end if;
  return p_id;
 end if;
 if p_parent is not null and not exists(select 1 from public.case_comments where id=p_parent and case_id=p_case and stance=p_stance and parent_id is null) then raise exception 'Thread not found' using errcode='P0002'; end if;
 insert into public.case_comments(id,case_id,parent_id,body,stance) values(p_id,p_case,p_parent,private.clean_text(p_body),p_stance);
 insert into private.comment_owners(comment_id,user_id) values(p_id,auth.uid());
 return p_id;
end; $$;

revoke all on function public.discussion_comments(uuid,uuid,timestamptz,uuid,text),
  public.post_case_comment(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.discussion_comments(uuid,uuid,timestamptz,uuid,text) to anon,authenticated;
grant execute on function public.post_case_comment(uuid,uuid,text,uuid,text) to authenticated;

create or replace function public.browse_trending_issues(
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
    created_at,updated_at,status,version,behavior,upvotes,is_sample
   from public.cases where status='published'
    and (p_constitution is null or constitution_number=p_constitution)
    and (coalesce(p_search,'')='' or (description||' '||improvement) ilike '%'||replace(replace(replace(left(p_search,200),'\','\\'),'%','\%'),'_','\_')||'%')
    and (p_upvotes is null or (upvotes,created_at,id)<(p_upvotes,p_time,p_id))
   order by upvotes desc,created_at desc,id desc limit 11
  ) c
 ),'[]'::jsonb));
end; $$;

notify pgrst,'reload schema';
