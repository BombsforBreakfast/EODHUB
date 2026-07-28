-- Admin-verified users have full platform access. Any lingering
-- must_complete_onboarding=true on verified rows is a bug-state holdover that
-- can bounce them through /pending or page-local onboarding checks.
-- Approve + failed-auth provision now clear this flag going forward; this
-- one-shot cleans existing rows.
--
-- trg_guard_provisioned_profile_flags blocks must_complete_onboarding changes
-- unless auth.role() = 'service_role'. Migrations don't run as service_role,
-- so disable + re-enable the trigger around this scrub.

alter table public.profiles disable trigger trg_guard_provisioned_profile_flags;

do $$
declare
  cleared_count bigint;
begin
  with cleared as (
    update public.profiles
    set must_complete_onboarding = false
    where verification_status = 'verified'
      and coalesce(admin_verified, false) = true
      and coalesce(must_complete_onboarding, false) = true
    returning user_id
  )
  select count(*) into cleared_count from cleared;

  raise notice 'cleared must_complete_onboarding on % verified profiles', cleared_count;
end
$$;

alter table public.profiles enable trigger trg_guard_provisioned_profile_flags;
