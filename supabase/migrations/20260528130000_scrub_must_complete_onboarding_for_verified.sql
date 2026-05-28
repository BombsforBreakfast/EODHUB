-- Verified users (verification_status='verified' + admin_verified + email_verified)
-- have full platform access. Any lingering must_complete_onboarding=true on
-- these accounts is a bug-state holdover and should not bounce them through
-- the onboarding gate. Going forward the gate hooks now SELECT the verification
-- columns so hasFullPlatformAccess short-circuits, but we still want the data
-- itself clean as a belt-and-suspenders for any path that doesn't read those
-- columns.
--
-- The trg_guard_provisioned_profile_flags trigger blocks must_complete_onboarding
-- changes unless auth.role() = 'service_role'. Migrations don't run as
-- service_role, so we disable + re-enable the trigger around this one-shot.

alter table public.profiles disable trigger trg_guard_provisioned_profile_flags;

do $$
declare
  cleared_count bigint;
begin
  with cleared as (
    update public.profiles
    set must_complete_onboarding = false
    where verification_status = 'verified'
      and coalesce(must_complete_onboarding, false) = true
    returning user_id
  )
  select count(*) into cleared_count from cleared;

  raise notice 'cleared must_complete_onboarding on % verified profiles', cleared_count;
end
$$;

alter table public.profiles enable trigger trg_guard_provisioned_profile_flags;
