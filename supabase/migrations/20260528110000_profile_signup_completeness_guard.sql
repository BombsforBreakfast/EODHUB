-- Require first/last name + service (member) or company (employer) before admin review.

begin;

create or replace function public.profile_signup_is_complete(p public.profiles)
returns boolean
language plpgsql
immutable
as $$
declare
  fn text;
  ln text;
begin
  if coalesce(p.is_pure_admin, false) then
    return true;
  end if;

  fn := nullif(trim(both from coalesce(p.first_name, '')), '');
  ln := nullif(trim(both from coalesce(p.last_name, '')), '');

  if fn is null or ln is null then
    return false;
  end if;

  if p.account_type = 'employer' or nullif(trim(both from coalesce(p.company_name, '')), '') is not null then
    return nullif(trim(both from coalesce(p.company_name, '')), '') is not null;
  end if;

  return nullif(trim(both from coalesce(p.service, '')), '') is not null;
end;
$$;

create or replace function public.guard_profile_signup_completeness()
returns trigger
language plpgsql
as $$
declare
  entering_admin_queue boolean;
begin
  if coalesce(new.is_pure_admin, false) then
    return new;
  end if;

  -- Grandfather profiles created before signup-field enforcement.
  if coalesce(new.created_at, now()) < timestamptz '2026-05-28' then
    return new;
  end if;

  -- Server routes validate before service-role writes; block client-side bypass.
  if auth.role() = 'service_role' then
    return new;
  end if;

  entering_admin_queue :=
    new.verification_status in (
      'awaiting_admin_review',
      'pending_admin_review',
      'pending'
    )
    and coalesce(new.email_verified, false) = true
    and (
      old.verification_status is distinct from new.verification_status
      or coalesce(old.email_verified, false) is distinct from coalesce(new.email_verified, false)
    );

  if entering_admin_queue and not public.profile_signup_is_complete(new) then
    raise exception
      'Profile must include first name, last name, and service (or company name for employers) before admin review';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_signup_completeness on public.profiles;

create trigger trg_guard_profile_signup_completeness
  before insert or update on public.profiles
  for each row
  execute function public.guard_profile_signup_completeness();

commit;
