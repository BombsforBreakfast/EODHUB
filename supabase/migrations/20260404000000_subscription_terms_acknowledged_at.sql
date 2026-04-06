-- Run in Supabase SQL editor if you do not apply migrations via CLI.
alter table public.profiles
  add column if not exists subscription_terms_acknowledged_at timestamptz;

comment on column public.profiles.subscription_terms_acknowledged_at is
  'Member acknowledged subscription terms during onboarding.';
