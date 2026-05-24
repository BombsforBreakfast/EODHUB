-- Enforce provisioned-profile flags server-side.
--
-- must_complete_onboarding and must_change_password are set by the admin
-- "Approve & email temp password" flow. End users must not be able to flip
-- them directly from the browser (which they otherwise could via the JS
-- client, since profiles RLS allows row owners to UPDATE their own row).
-- The matching cleared-from-server happens via /api/account/complete-onboarding
-- and /api/account/clear-temp-password-flag.

create or replace function public.guard_provisioned_profile_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service-role (used by API routes) bypasses the guard.
  if (auth.role() = 'service_role') then
    return new;
  end if;

  if (new.must_complete_onboarding is distinct from old.must_complete_onboarding) then
    raise exception 'must_complete_onboarding can only be changed server-side';
  end if;

  if (new.must_change_password is distinct from old.must_change_password) then
    raise exception 'must_change_password can only be changed server-side';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_provisioned_profile_flags on public.profiles;
create trigger trg_guard_provisioned_profile_flags
  before update on public.profiles
  for each row execute function public.guard_provisioned_profile_flags();
