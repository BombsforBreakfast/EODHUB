-- Stale edits are a business conflict, not a serialization failure. PT409
-- returns directly through PostgREST instead of triggering transaction retries.
create or replace function public.ticketing_save_event(p_actor uuid,p_id uuid,p_expected integer,p_draft jsonb,p_event jsonb,p_submit boolean) returns public.ticketing_events
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_events; begin
  if not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into r from public.ticketing_events where id=p_id for update;
  if not found then
    if p_expected is null or p_expected<>0 or not exists(select 1 from public.ticketing_accounts where user_id=p_actor and (can_submit_events or public.ticketing_is_admin(p_actor))) then
      raise exception 'Event creation not permitted' using errcode='42501'; end if;
    insert into public.ticketing_events(id,created_by) values(p_id,p_actor) returning * into r;
    if not public.ticketing_is_admin(p_actor) then
      insert into public.ticketing_assignments(event_id,user_id,role,assigned_by) values(p_id,p_actor,'coordinator',p_actor);
    end if;
  else
    if not public.ticketing_has_access(p_actor,p_id) then raise exception 'Access denied' using errcode='42501'; end if;
    if p_expected is null or r.revision<>p_expected then raise exception 'This event changed. Reload before saving.' using errcode='PT409'; end if;
  end if;
  if p_submit and (p_event is null or not(p_event ?& array['title','startsAt','timeZone','capacity','priceCents'])) then raise exception 'Complete event details'; end if;
  update public.ticketing_events set draft=p_draft,event=case when p_submit then p_event else null end,
    review_status=case when p_submit then 'pending' else 'draft' end,review_note='',reviewed_by=null,listed=false,
    revision=r.revision+1,updated_at=now() where id=p_id returning * into r;
  insert into public.ticketing_audit(event_id,actor_id,action) values(p_id,p_actor,case when p_submit then 'submitted' else 'draft_saved' end);
  return r;
end $$;
create or replace function public.ticketing_review_event(p_actor uuid,p_id uuid,p_expected integer,p_decision text,p_note text) returns public.ticketing_events
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_events; begin
  if not public.ticketing_is_admin(p_actor) then raise exception 'Owner review required' using errcode='42501'; end if;
  select * into r from public.ticketing_events where id=p_id for update;
  if not found or p_expected is null or r.revision<>p_expected then raise exception 'This event changed. Reload before reviewing.' using errcode='PT409'; end if;
  if r.review_status<>'pending' or p_decision not in ('approved','changes_requested','rejected') or length(p_note)>1500
    or (p_decision<>'approved' and length(trim(p_note))<3) then raise exception 'Choose a review decision and note'; end if;
  update public.ticketing_events set review_status=p_decision,review_note=p_note,reviewed_by=p_actor,listed=false,
    revision=revision+1,updated_at=now() where id=p_id returning * into r;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(p_id,p_actor,p_decision,jsonb_build_object('note',p_note));
  return r;
end $$;
revoke all on function public.ticketing_save_event(uuid,uuid,integer,jsonb,jsonb,boolean),public.ticketing_review_event(uuid,uuid,integer,text,text) from public,anon,authenticated,eod_rental,eod_ticketing;
grant execute on function public.ticketing_save_event(uuid,uuid,integer,jsonb,jsonb,boolean),public.ticketing_review_event(uuid,uuid,integer,text,text) to service_role;
