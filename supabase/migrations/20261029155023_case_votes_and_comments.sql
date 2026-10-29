-- Discussion is public; identities and individual ballots remain private.
create table private.case_votes (
 case_id uuid not null references public.cases(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 value smallint not null check(value in (-1,1)),
 created_at timestamptz not null default now(),
 primary key(case_id,user_id)
);
create index case_votes_user_idx on private.case_votes(user_id);
create table public.case_comments (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.cases(id) on delete cascade,
 parent_id uuid,
 body text not null,
 created_at timestamptz not null default now(),
 is_deleted boolean not null default false,
 unique(case_id,id),
 foreign key(case_id,parent_id) references public.case_comments(case_id,id),
 check(parent_id is distinct from id),
 check((is_deleted and body='') or (not is_deleted and length(private.clean_text(body)) between 1 and 2000 and length(body)<=2000))
);
create index case_comments_thread_idx on public.case_comments(case_id,parent_id,created_at,id);
create table private.comment_owners (
 comment_id uuid primary key references public.case_comments(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete restrict
);
create index comment_owners_user_idx on private.comment_owners(user_id,comment_id);
alter table public.case_comments enable row level security;
alter table private.case_votes enable row level security;
alter table private.comment_owners enable row level security;
revoke all on public.case_comments from public,anon,authenticated;
revoke all on private.case_votes,private.comment_owners from public,anon,authenticated;
grant select on public.case_comments to anon,authenticated;
create policy comment_read on public.case_comments for select to anon,authenticated
 using(exists(select 1 from public.cases c where c.id=case_id and c.status='published'));

-- All author information exposed to readers is the constant label "Anonymous".
-- can_delete is a request-local boolean, never an author or profile identifier.
create function private.comment_json(c public.case_comments) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'parent_id',c.parent_id,'body',c.body,
  'created_at',c.created_at,'is_deleted',c.is_deleted,'author','Anonymous',
  'can_delete',exists(select 1 from private.comment_owners o where o.comment_id=c.id and o.user_id=auth.uid()),
  'reply_count',(select count(*) from public.case_comments r where r.case_id=c.case_id and r.parent_id=c.id and not r.is_deleted))
$$;
revoke all on function private.comment_json(public.case_comments) from public,anon,authenticated;

-- At most 12 summaries and two root-comment previews per case: one bounded feed query.
create function public.case_discussions(p_cases uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if p_cases is null or cardinality(p_cases)>12 then raise exception 'Request at most 12 cases'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'case_id',c.id,
  'upvotes',(select count(*) from private.case_votes v where v.case_id=c.id and v.value=1),
  'downvotes',(select count(*) from private.case_votes v where v.case_id=c.id and v.value=-1),
  'my_vote',coalesce((select value from private.case_votes v where v.case_id=c.id and v.user_id=auth.uid()),0),
  'comment_count',(select count(*) from public.case_comments m where m.case_id=c.id and not m.is_deleted),
  'root_count',(select count(*) from public.case_comments m where m.case_id=c.id and m.parent_id is null
   and (not m.is_deleted or exists(select 1 from public.case_comments r where r.case_id=m.case_id and r.parent_id=m.id and not r.is_deleted))),
  'preview',coalesce((select jsonb_agg(private.comment_json(p) order by p.created_at desc,p.id desc) from (
   select m.* from public.case_comments m where m.case_id=c.id and m.parent_id is null
    and (not m.is_deleted or exists(select 1 from public.case_comments r where r.case_id=m.case_id and r.parent_id=m.id and not r.is_deleted))
   order by m.created_at desc,m.id desc limit 2
  ) p),'[]'::jsonb)
 )) from public.cases c where c.id=any(p_cases) and c.status='published'),'[]'::jsonb);
end; $$;

-- Root comments: newest first. Replies: chronological, as in a video comment thread.
-- Each page is bounded, and (created_at,id) is the stable cursor in either direction.
create function public.discussion_comments(p_case uuid,p_parent uuid default null,p_time timestamptz default null,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare page jsonb;
begin
 if not exists(select 1 from public.cases where id=p_case and status='published') then raise exception 'Case not found' using errcode='P0002'; end if;
 if (p_time is null)<>(p_id is null) then raise exception 'Invalid cursor'; end if;
 if p_parent is not null and not exists(select 1 from public.case_comments where id=p_parent and case_id=p_case and parent_id is null) then raise exception 'Thread not found' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(private.comment_json(p) order by
  case when p_parent is null then p.created_at end desc,case when p_parent is null then p.id end desc,
  case when p_parent is not null then p.created_at end asc,case when p_parent is not null then p.id end asc),'[]'::jsonb) into page from (
  select m.* from public.case_comments m where m.case_id=p_case and m.parent_id is not distinct from p_parent
   and (not m.is_deleted or (p_parent is null and exists(select 1 from public.case_comments r where r.case_id=m.case_id and r.parent_id=m.id and not r.is_deleted)))
   and (p_time is null or (case when p_parent is null then (m.created_at,m.id)<(p_time,p_id) else (m.created_at,m.id)>(p_time,p_id) end))
  order by case when p_parent is null then m.created_at end desc,case when p_parent is null then m.id end desc,
   case when p_parent is not null then m.created_at end asc,case when p_parent is not null then m.id end asc limit 11
 ) p;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(value order by n),'[]'::jsonb) from jsonb_array_elements(page) with ordinality a(value,n) where n<=10), 'has_more',jsonb_array_length(page)>10);
end; $$;

create function public.vote_case(p_case uuid,p_value smallint) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_value is null or p_value not in (-1,0,1) then raise exception 'Invalid vote'; end if;
 perform 1 from public.cases where id=p_case and status='published' for share;
 if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 if p_value=0 then delete from private.case_votes where case_id=p_case and user_id=auth.uid();
 else insert into private.case_votes(case_id,user_id,value) values(p_case,auth.uid(),p_value)
  on conflict(case_id,user_id) do update set value=excluded.value;
 end if;
end; $$;

create function public.post_case_comment(p_case uuid,p_id uuid,p_body text,p_parent uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.case_comments;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_id is null or p_body is null or length(p_body)>2000 or length(private.clean_text(p_body))<1 then raise exception 'Write a comment of 1–2,000 characters'; end if;
 perform 1 from public.cases where id=p_case and status='published' for share;
 if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from public.case_comments where id=p_id;
 if found then
  if not exists(select 1 from private.comment_owners where comment_id=p_id and user_id=auth.uid())
   or existing.case_id<>p_case or existing.parent_id is distinct from p_parent
   or existing.body<>private.clean_text(p_body) or existing.is_deleted then raise exception 'Comment ID already used' using errcode='42501'; end if;
  return p_id;
 end if;
 if p_parent is not null and not exists(select 1 from public.case_comments where id=p_parent and case_id=p_case and parent_id is null) then raise exception 'Thread not found' using errcode='P0002'; end if;
 insert into public.case_comments(id,case_id,parent_id,body) values(p_id,p_case,p_parent,private.clean_text(p_body));
 insert into private.comment_owners(comment_id,user_id) values(p_id,auth.uid());
 return p_id;
end; $$;

-- Tombstones preserve replies when their parent is deleted. Only its author can delete.
create function public.delete_case_comment(p_case uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform 1 from public.cases where id=p_case and status='published' for share;
 if not found then raise exception 'Case not found' using errcode='P0002'; end if;
 if not exists(select 1 from public.case_comments m join private.comment_owners o on o.comment_id=m.id
  where m.id=p_id and m.case_id=p_case and o.user_id=auth.uid()) then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.case_comments set body='',is_deleted=true where id=p_id;
end; $$;

revoke all on function public.case_discussions(uuid[]),public.discussion_comments(uuid,uuid,timestamptz,uuid),
 public.vote_case(uuid,smallint),public.post_case_comment(uuid,uuid,text,uuid),public.delete_case_comment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.case_discussions(uuid[]),public.discussion_comments(uuid,uuid,timestamptz,uuid) to anon,authenticated;
grant execute on function public.vote_case(uuid,smallint),public.post_case_comment(uuid,uuid,text,uuid),public.delete_case_comment(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
