-- Failed login / signup reports for Beta troubleshooting.
--
-- Captures every detectable failed auth attempt with enough context for an
-- admin to diagnose pending-verification ghosts, Turnstile blocks, account
-- creation failures, OAuth-duplicate confusion, beta-gate denials, etc.
--
-- Plaintext email_attempted is stored intentionally (admin-only via API) so
-- Beta operators can correlate user reports with system events. RLS is
-- deny-by-default: only the service role (used by API routes) may read or
-- write. The admin Failed Auth tab fetches via /api/admin/failed-auth-reports
-- which checks profiles.is_admin server-side.

create table if not exists public.failed_auth_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email_attempted text,
  normalized_email text,
  ip_address text,
  user_agent text,
  source_route text,
  failure_reason text not null,
  error_code text,
  raw_error_message text,
  turnstile_status text,
  turnstile_error text,
  user_exists_in_auth boolean,
  user_exists_in_profiles boolean,
  verification_status text,
  request_id text not null,
  attempt_count integer,
  risk_level text not null default 'LOW'
    check (risk_level in ('LOW', 'MEDIUM', 'HIGH'))
);

comment on table public.failed_auth_reports is
  'Beta-era audit log of failed login/signup attempts. Admin read-only via service role API.';
comment on column public.failed_auth_reports.email_attempted is
  'Plaintext email as the user typed it (admin-only). Used to correlate user reports with auth failures.';
comment on column public.failed_auth_reports.normalized_email is
  'Lowercased + trimmed email used for joins, search, and velocity counts.';
comment on column public.failed_auth_reports.failure_reason is
  'Enum from FailedAuthReason (INVALID_PASSWORD, ACCOUNT_PENDING, EMAIL_NOT_FOUND, TURNSTILE_FAILED, RATE_LIMITED, BETA_DENIED, ACCOUNT_CREATION_FAILED, PROFILE_CREATION_FAILED, ...).';
comment on column public.failed_auth_reports.risk_level is
  'LOW | MEDIUM | HIGH — computed at insert time from same-IP / same-email frequency in the last hour.';

create index if not exists failed_auth_reports_created_at_idx
  on public.failed_auth_reports (created_at desc);

create index if not exists failed_auth_reports_normalized_email_idx
  on public.failed_auth_reports (normalized_email);

create index if not exists failed_auth_reports_ip_address_idx
  on public.failed_auth_reports (ip_address);

create index if not exists failed_auth_reports_failure_reason_idx
  on public.failed_auth_reports (failure_reason);

create index if not exists failed_auth_reports_risk_level_idx
  on public.failed_auth_reports (risk_level);

alter table public.failed_auth_reports enable row level security;

-- No policies defined: only the service role (API routes) may read or write
-- this table. Admin reads go through /api/admin/failed-auth-reports which
-- verifies profiles.is_admin before querying.
