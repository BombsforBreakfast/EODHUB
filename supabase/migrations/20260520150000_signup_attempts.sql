-- Audit log for every signup attempt that reaches /api/auth/signup or
-- /api/auth/validate-email. Powers per-IP and per-email velocity rate
-- limiting and gives admins a way to investigate abuse patterns.
--
-- Email is stored only as a SHA-256 hash (email_hash) so we can detect
-- repeated attempts of the same address without retaining the raw PII of
-- attackers. The domain is stored in the clear so we can surface which
-- providers are abusing the signup flow.

create table if not exists public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ip text null,
  user_agent text null,
  email_hash text null,
  email_domain text null,
  outcome text not null,
  reason text null,
  supabase_user_id uuid null references auth.users (id) on delete set null,
  constraint signup_attempts_outcome_chk
    check (outcome in ('allowed', 'blocked'))
);

comment on table public.signup_attempts is
  'Audit log of signup attempts (allowed + blocked). Service role only.';
comment on column public.signup_attempts.email_hash is
  'SHA-256 of the normalized (lowercased, trimmed) email address.';
comment on column public.signup_attempts.email_domain is
  'Plaintext email domain for abuse pattern analysis.';
comment on column public.signup_attempts.outcome is
  'allowed = auth user created; blocked = rejected before createUser.';
comment on column public.signup_attempts.reason is
  'Reason code for blocked attempts (disposable_domain, rate_limited_*, turnstile_failed, supabase_*).';

create index if not exists signup_attempts_ip_created_at_idx
  on public.signup_attempts (ip, created_at desc);

create index if not exists signup_attempts_email_hash_created_at_idx
  on public.signup_attempts (email_hash, created_at desc);

create index if not exists signup_attempts_outcome_created_at_idx
  on public.signup_attempts (outcome, created_at desc);

alter table public.signup_attempts enable row level security;

-- No policies defined: only the service role (used by API routes) may
-- read or write this table.
