-- Stripe Billing Links customer id (created on first checkout).
-- Run in Supabase SQL editor if you do not apply migrations via CLI.

alter table public.profiles
  add column if not exists stripe_customer_id text;

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer ID for member billing; set when user starts checkout.';

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
