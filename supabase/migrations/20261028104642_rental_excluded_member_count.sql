-- Keep the login-screen signup total independent of rental-only identities.
-- One database snapshot prevents signup/provisioning races between queries.
create function public.hub_member_signup_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*)
  from public.profiles p
  where not exists (
    select 1 from public.rental_providers r where r.user_id=p.user_id
  ) and not exists (
    select 1 from auth.users u where u.id=p.user_id
      and (u.role='eod_rental' or u.raw_app_meta_data->>'account_type'='rental_provider')
  );
$$;

-- Auth metadata is private. Only the server may execute this aggregate;
-- no table grants, signup triggers, member rows, or browser access change.
revoke all on function public.hub_member_signup_count() from public,anon,authenticated,eod_rental;
grant execute on function public.hub_member_signup_count() to service_role;
