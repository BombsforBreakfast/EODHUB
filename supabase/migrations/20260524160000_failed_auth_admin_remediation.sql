-- Admin remediation for failed auth reports: override blocks and provision temp passwords.

create table if not exists public.auth_access_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  normalized_email text not null,
  ip_address text,
  scope text not null default 'rate_limit'
    check (scope in ('rate_limit', 'full')),
  reason text,
  created_by_admin_id uuid not null,
  failed_auth_report_id uuid references public.failed_auth_reports (id) on delete set null,
  revoked_at timestamptz
);

comment on table public.auth_access_overrides is
  'Admin-granted bypass for signup velocity / email validation blocks tied to a failed auth report.';
comment on column public.auth_access_overrides.scope is
  'rate_limit = velocity + burst only; full = also skip disposable-email validation.';

create index if not exists auth_access_overrides_email_active_idx
  on public.auth_access_overrides (normalized_email, expires_at desc)
  where revoked_at is null;

create index if not exists auth_access_overrides_ip_active_idx
  on public.auth_access_overrides (ip_address, expires_at desc)
  where revoked_at is null and ip_address is not null;

alter table public.failed_auth_reports
  add column if not exists admin_decision text,
  add column if not exists admin_decided_at timestamptz,
  add column if not exists admin_decided_by uuid,
  add column if not exists admin_notes text;

comment on column public.failed_auth_reports.admin_decision is
  'block_overridden | provisioned | dismissed';

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists must_complete_onboarding boolean not null default false,
  add column if not exists admin_provisioned_at timestamptz,
  add column if not exists temp_password_email_sent_at timestamptz;

alter table public.auth_access_overrides enable row level security;
