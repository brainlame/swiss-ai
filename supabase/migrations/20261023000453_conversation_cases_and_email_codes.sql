-- Additive: historical screenshot cases and prompt/reply pairs are untouched.
alter table public.cases
  add column transcript jsonb,
  add column behavior text check (behavior in ('good','bad'));

create function private.valid_transcript(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare m jsonb; n integer:=0; total integer:=0; amount integer;
begin
 if value is null then return true; end if;
 if jsonb_typeof(value)<>'array' then return false; end if;
 amount:=jsonb_array_length(value);
 if amount<2 or amount>100 or amount%2<>0 then return false; end if;
 for m in select * from jsonb_array_elements(value) loop
  if jsonb_typeof(m)<>'object' then return false; end if;
  if (select count(*) from jsonb_object_keys(m))<>2 or not (m ? 'role' and m ? 'text')
   or jsonb_typeof(m->'text')<>'string' or jsonb_typeof(m->'role')<>'string'
   or m->>'role'<>(case when n%2=0 then 'user' else 'assistant' end)
   or length(private.clean_text(m->>'text'))<1 or length(m->>'text')>10000 then return false; end if;
  total:=total+length(m->>'text'); n:=n+1;
 end loop;
 return total<=100000;
end; $$;
revoke all on function private.valid_transcript(jsonb) from public,anon,authenticated;
alter table public.cases add constraint cases_transcript_valid check (private.valid_transcript(transcript));

create function private.protect_transcript() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.transcript is distinct from old.transcript then raise exception 'The attached conversation is read-only'; end if;
 return new;
end; $$;
revoke all on function private.protect_transcript() from public,anon,authenticated;
create trigger case_transcript_immutable before update on public.cases for each row execute function private.protect_transcript();

-- Retire the old creation/publishing RPCs so direct API callers cannot create
-- screenshot-only or unclassified cases. Existing rows and Storage policies stay intact.
drop function public.begin_case(uuid,smallint,text,text,text,text);
drop function public.commit_case(uuid,integer,smallint,text,text,text[]);
revoke execute on function public.reserve_upload(uuid,text,bigint) from public,anon,authenticated;

-- One atomic save replaces staged uploads. No partially published submissions.
create function public.save_case(
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
  if c.version=p_version+1 and c.constitution_number=p_constitution
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

-- Supported password-login control; hosted activation is separate (Teams/Enterprise).
-- Do not log out existing OTP sessions when an attacker tries a password.
create function public.reject_password_login(event jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('decision','reject','message','Sign in using an emailed verification code.','should_logout_user',false)
$$;
revoke all on function public.reject_password_login(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.reject_password_login(jsonb) to supabase_auth_admin;
notify pgrst, 'reload schema';
