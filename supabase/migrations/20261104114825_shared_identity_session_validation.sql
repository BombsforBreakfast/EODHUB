-- Forward hardening for the shared account BFF; no existing rows are changed.
-- A ban is checked at access time. It must not erase the underlying approval
-- classification and strand an approved account after the ban expires.
create or replace function portal_private.full_hub_access(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_actor and (p.is_pure_admin or p.account_type='business_org'
      or (p.email_verified and p.admin_verified and p.verification_status='verified')));
$$;

-- Only the service-side API may inspect session liveness. A cryptographically
-- verified JWT alone can remain valid briefly after its session is signed out.
create function public.portal_session_active(p_actor uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=p_session and s.user_id=p_actor
      and (s.not_after is null or s.not_after>now())
      and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function public.portal_session_active(uuid,uuid) from public,anon,authenticated,eod_portal,eod_rental,eod_ticketing;
grant execute on function public.portal_session_active(uuid,uuid) to service_role;
