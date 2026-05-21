-- Post-onboarding email verification before admin review queue.

alter table public.profiles
  add column if not exists email_verified boolean not null default false,
  add column if not exists admin_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz null;

comment on column public.profiles.email_verified is
  'True after the user clicks the Resend verification link (OAuth users may be set true at onboarding).';
comment on column public.profiles.admin_verified is
  'True after admin approval or 3 community vouches.';
comment on column public.profiles.email_verified_at is
  'Timestamp when email_verified was set to true.';

-- Grandfather existing users into the new state machine.
update public.profiles
set
  email_verified = true,
  admin_verified = true
where verification_status = 'verified';

update public.profiles
set
  email_verified = true,
  admin_verified = false,
  verification_status = 'pending_admin_review'
where verification_status = 'pending';

create table if not exists public.email_verification_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists email_verification_tokens_user_id_created_at_idx
  on public.email_verification_tokens (user_id, created_at desc);

alter table public.email_verification_tokens enable row level security;

-- No policies: service role only via API routes.
