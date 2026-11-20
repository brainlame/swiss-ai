-- New issues no longer require a principle selection. Existing references are preserved.
alter table public.cases alter column constitution_number drop not null;

create or replace function public.save_case(
 p_id uuid,p_version integer,p_constitution smallint,p_description text,
 p_improvement text,p_transcript jsonb,p_behavior text
) returns integer language plpgsql security definer set search_path='' as $$
declare c public.cases;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if p_id is null or p_version is null or p_version<1 then raise exception 'Invalid case'; end if;
 if p_behavior is null or p_behavior not in ('good','bad') then raise exception 'Choose a behavior classification'; end if;
 if not private.valid_transcript(p_transcript) then raise exception 'Invalid conversation'; end if;
 -- Serialize same-ID retries even when the row does not yet exist.
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into c from public.cases where id=p_id for update;
 if found then
  if not public.owns_case(p_id) or c.status<>'published' then raise exception 'Not authorized'; end if;
  if c.transcript is distinct from p_transcript then raise exception 'The attached conversation is read-only'; end if;
  if c.version=p_version+1 and c.constitution_number is not distinct from p_constitution
   and c.description=private.clean_text(p_description) and c.improvement=private.clean_text(p_improvement)
   and c.behavior=p_behavior then return c.version; end if;
  if c.version<>p_version then raise exception 'This case changed. Reload before saving again.'; end if;
  update public.cases set constitution_number=p_constitution,description=private.clean_text(p_description),
   improvement=private.clean_text(p_improvement),behavior=p_behavior,version=version+1,updated_at=now() where id=p_id;
  return c.version+1;
 end if;
 if p_version<>1 or p_transcript is null then raise exception 'Start a case from a Chatbot conversation'; end if;
 insert into public.cases(id,constitution_number,description,improvement,transcript,behavior,status,version)
  values(p_id,p_constitution,private.clean_text(p_description),private.clean_text(p_improvement),p_transcript,p_behavior,'published',2);
 insert into private.case_owners(case_id,user_id) values(p_id,auth.uid());
 return 2;
end; $$;
revoke all on function public.save_case(uuid,integer,smallint,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_case(uuid,integer,smallint,text,text,jsonb,text) to authenticated;


create or replace function public.issue_overview() returns jsonb
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
  'topics', (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'count',g.n) order by g.name),'[]'::jsonb)
   from (
    select coalesce(t.id,'unclassified') as id,coalesce(t.name,'Unclassified') as name,count(*) as n
    from public.cases c left join public.issue_topic_assignments a on a.issue_id=c.id
    left join public.issue_topics t on t.id=a.topic_id
    where c.status='published' group by t.id,t.name
   ) g),
  'constitutions',(select jsonb_agg(jsonb_build_object('number',c.number,'count',coalesce(t.n,0)) order by c.number)
   from public.constitutions c left join (select constitution_number,sum(n) as n from counts group by constitution_number) t on t.constitution_number=c.number)
 );
$$;

notify pgrst,'reload schema';
