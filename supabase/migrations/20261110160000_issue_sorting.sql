-- Ranking uses a fixed time for a pagination session and rejects changed data.
-- Private ballots are aggregated here, and only public issue fields are returned.
create function public.browse_ranked_issues(
 p_search text default '', p_constitution integer default null, p_topic text default null,
 p_sort text default 'trending', p_offset integer default 0,
 p_asof timestamptz default null, p_revision bigint default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare current_revision bigint; ranking_time timestamptz := coalesce(p_asof, statement_timestamp());
begin
 if p_sort is null or p_sort not in ('trending','discussed','controversial')
  or p_offset is null or p_offset<0 or p_offset>10000000
  or (p_offset>0 and (p_asof is null or p_revision is null))
  or p_revision<0 or not isfinite(ranking_time)
  or ranking_time>statement_timestamp()+interval '1 minute' then
  raise exception 'Invalid ranking cursor' using errcode='22023';
 end if;
 select revision into current_revision from public.issue_feed_state where id=1;
 if p_revision is not null and p_revision<>current_revision then
  raise exception 'Issues have changed. Refresh the ranking to load more.' using errcode='40001';
 end if;
 return jsonb_build_object(
  'revision', current_revision::text, 'asof', ranking_time, 'offset', p_offset,
  'topics', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
   from public.issue_topics t),'[]'::jsonb),
  'has_unclassified', exists(select 1 from public.cases c where c.status='published'
   and not exists(select 1 from public.issue_topic_assignments a where a.issue_id=c.id)),
  'items', coalesce((
   with eligible as (
    select c.id,c.constitution_number,left(c.description,600) as description,
     left(c.improvement,300) as improvement,c.created_at,c.updated_at,c.status,c.version,c.behavior,c.is_sample,
     c.upvotes as wanted, c.sample_unwanted_votes+coalesce(v.n,0) as unwanted,
     coalesce(m.n,0) as comments
    from public.cases c
    left join (select case_id,count(*) n from private.case_votes where value=-1 group by case_id) v on v.case_id=c.id
    left join (select case_id,count(*) n from public.case_comments where not is_deleted group by case_id) m on m.case_id=c.id
    where c.status='published'
     and (p_constitution is null or c.constitution_number=p_constitution)
     and (p_topic is null or case when p_topic='unclassified' then not exists(
      select 1 from public.issue_topic_assignments a where a.issue_id=c.id)
      else exists(select 1 from public.issue_topic_assignments a where a.issue_id=c.id and a.topic_id=p_topic) end)
     and (coalesce(p_search,'')='' or (c.description||' '||c.improvement) ilike
      '%'||replace(replace(replace(left(p_search,200),'\','\\'),'%','\%'),'_','\_')||'%')
   ), scored as (
    select *, case p_sort
     when 'discussed' then comments::numeric
     when 'controversial' then 1-abs(wanted-unwanted)::numeric/nullif(wanted+unwanted,0)
     else (wanted+unwanted)::numeric / power(greatest(0,extract(epoch from (ranking_time-created_at))/3600)+2,1.5)
     end as score
    from eligible where p_sort<>'controversial' or wanted+unwanted>0
   ), page as (
    select * from scored order by score desc,created_at desc,id desc limit 11 offset p_offset
   )
   select jsonb_agg(to_jsonb(page)-'wanted'-'unwanted'-'comments'-'score' order by score desc,created_at desc,id desc)
   from page
  ),'[]'::jsonb));
end; $$;
revoke all on function public.browse_ranked_issues(text,integer,text,text,integer,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.browse_ranked_issues(text,integer,text,text,integer,timestamptz,bigint) to anon,authenticated;

-- Negative ballots and comment changes also affect ranking now.
create function private.signal_discussion_ranking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old is not distinct from new then return null; end if;
 update public.issue_feed_state set revision=revision+1,updated_at=clock_timestamp() where id=1;
 return null;
end; $$;
revoke all on function private.signal_discussion_ranking() from public,anon,authenticated;
create trigger discussion_ranking_changed after insert or update or delete on public.case_comments
for each row execute function private.signal_discussion_ranking();
create trigger ballot_ranking_changed after insert or update or delete on private.case_votes
for each row execute function private.signal_discussion_ranking();
notify pgrst,'reload schema';
