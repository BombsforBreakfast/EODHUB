begin;

-- Formalize legacy profile billing columns (may already exist on production).
alter table public.profiles
  add column if not exists subscription_status text,
  add column if not exists stripe_customer_id text;

comment on column public.profiles.subscription_status is
  'Legacy Stripe subscription status. Dual-written during billing migration; prefer billing_entitlements.';
comment on column public.profiles.stripe_customer_id is
  'Legacy Stripe customer id. Prefer billing_subscriptions.provider_customer_id.';

-- ---------------------------------------------------------------------------
-- billing_subscriptions — one row per external subscription contract
-- ---------------------------------------------------------------------------
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'business_org_page')),
  subject_id uuid not null,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  provider_customer_id text,
  provider_subscription_id text not null,
  product_id text not null,
  status text not null check (
    status in ('active', 'trialing', 'past_due', 'canceled', 'expired', 'paused')
  ),
  entitlement_keys text[] not null default array['eodhub_member']::text[],
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  canceled_at timestamptz,
  last_verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_provider_sub_unique unique (provider, provider_subscription_id)
);

create index if not exists billing_subscriptions_subject_status_idx
  on public.billing_subscriptions (subject_type, subject_id, status);

create index if not exists billing_subscriptions_subject_idx
  on public.billing_subscriptions (subject_type, subject_id);

-- ---------------------------------------------------------------------------
-- billing_entitlements — materialized current entitlement state (fast reads)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user', 'business_org_page')),
  subject_id uuid not null,
  entitlement_key text not null,
  status text not null check (status in ('active', 'expired')),
  expires_at timestamptz,
  source_subscription_id uuid references public.billing_subscriptions (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint billing_entitlements_subject_key_unique unique (subject_type, subject_id, entitlement_key)
);

create index if not exists billing_entitlements_subject_active_idx
  on public.billing_entitlements (subject_type, subject_id, status);

-- ---------------------------------------------------------------------------
-- billing_events — immutable audit log + webhook idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'revenuecat')),
  provider_event_id text not null,
  event_type text not null,
  subject_type text check (subject_type in ('user', 'business_org_page')),
  subject_id uuid,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  processing_result text not null check (processing_result in ('applied', 'skipped', 'failed')),
  error_message text,
  constraint billing_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists billing_events_subject_idx
  on public.billing_events (subject_type, subject_id, processed_at desc);

-- RLS: webhooks write via service_role; users read own entitlements only.
alter table public.billing_subscriptions enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists billing_entitlements_user_select on public.billing_entitlements;
create policy billing_entitlements_user_select
  on public.billing_entitlements
  for select
  to authenticated
  using (
    subject_type = 'user'
    and subject_id = auth.uid()
  );

drop policy if exists billing_subscriptions_user_select on public.billing_subscriptions;
create policy billing_subscriptions_user_select
  on public.billing_subscriptions
  for select
  to authenticated
  using (
    subject_type = 'user'
    and subject_id = auth.uid()
  );

-- billing_events: no policies — service_role API routes only.

-- Backfill active Stripe members into billing_entitlements (idempotent).
insert into public.billing_entitlements (
  subject_type,
  subject_id,
  entitlement_key,
  status,
  updated_at
)
select
  'user',
  p.user_id,
  'eodhub_member',
  'active',
  now()
from public.profiles p
where p.subscription_status in ('active', 'trialing')
on conflict (subject_type, subject_id, entitlement_key) do update
  set status = excluded.status,
      updated_at = excluded.updated_at;

commit;
