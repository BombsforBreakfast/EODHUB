-- One-shot backfill: wipe unresolved failed_auth_reports for any user who
-- already has full platform access (verification_status = 'verified'). Going
-- forward this cleanup runs automatically inside approveUserAccount, but
-- existing stale reports for previously-verified users (who got through
-- before that hook was added) are still sitting in the triage queue.
--
-- Only deletes rows where admin_decision IS NULL so resolved / provisioned
-- entries stay in the audit trail.

begin;

do $$
declare
  cleared_count bigint;
begin
  with verified_emails as (
    select distinct lower(trim(email)) as email
    from public.profiles
    where verification_status = 'verified'
      and email is not null
      and length(trim(email)) > 0
    union
    select distinct lower(trim(u.email))
    from auth.users u
    join public.profiles p on p.user_id = u.id
    where p.verification_status = 'verified'
      and u.email is not null
      and length(trim(u.email)) > 0
  ),
  deleted as (
    delete from public.failed_auth_reports r
    using verified_emails v
    where r.normalized_email = v.email
      and r.admin_decision is null
    returning r.id
  )
  select count(*) into cleared_count from deleted;

  raise notice 'failed_auth_reports backfill cleared % stale unresolved rows for verified users', cleared_count;
end
$$;

commit;
