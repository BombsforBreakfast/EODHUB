-- Keep Auth tables private. Ticketing RPCs run as service_role, which can use
-- the guarded profile email but cannot SELECT auth.users. All client roles
-- remain denied; the API supplies only its verified actor's email.
create or replace function public.ticketing_is_admin(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.profiles p
    join public.ticketing_accounts a on a.user_id=p.user_id and a.active
    where p.user_id=p_actor and p_actor='a28ddac8-dc3a-4ae1-83f5-b675e7b85871'::uuid
    and lower(p.email)='micheal.p.twigg@gmail.com' and p.is_admin=true)
$$;

drop function public.ticketing_accept_invite(uuid,text);
create function public.ticketing_accept_invite(p_actor uuid,p_digest text,p_verified_email text) returns boolean
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_invitations; actor_email text; begin
  -- Service-only attestation from getUserById on every authenticated request.
  -- The API never takes this email or p_actor from the caller's JSON body.
  actor_email:=lower(trim(p_verified_email));
  if actor_email is null or length(actor_email) not between 5 and 254
    or not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then
    raise exception 'Verify your email first' using errcode='42501'; end if;
  select * into r from public.ticketing_invitations where digest=p_digest for update;
  if not found or r.email<>actor_email or r.revoked_at is not null or r.expires_at<=now()
    or (r.access_expires_at is not null and r.access_expires_at<=now()) then raise exception 'Invitation is unavailable for this email' using errcode='42501'; end if;
  if r.accepted_at is not null then return r.accepted_by=p_actor; end if;
  if not public.ticketing_is_admin(r.created_by) and (r.role<>'checkin_staff' or not public.ticketing_has_access(r.created_by,r.event_id)) then
    raise exception 'Invitation is no longer authorized' using errcode='42501'; end if;
  if r.role='coordinator' and r.event_id is null then
    update public.ticketing_accounts set can_submit_events=true where user_id=p_actor;
  elsif r.role<>'customer' then
    insert into public.ticketing_assignments(event_id,user_id,role,expires_at,assigned_by)
      values(r.event_id,p_actor,r.role,r.access_expires_at,r.created_by)
    on conflict(event_id,user_id,role) do update set expires_at=excluded.expires_at,revoked_at=null,assigned_by=excluded.assigned_by;
  end if;
  update public.ticketing_invitations set accepted_at=now(),accepted_by=p_actor where id=r.id;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(r.event_id,p_actor,'invitation_accepted',jsonb_build_object('role',r.role));
  return true;
end $$;
revoke all on function public.ticketing_is_admin(uuid),public.ticketing_accept_invite(uuid,text,text) from public,anon,authenticated,eod_rental,eod_ticketing;
grant execute on function public.ticketing_is_admin(uuid),public.ticketing_accept_invite(uuid,text,text) to service_role;
