-- Existing partner listings keep their stable IDs, contacts, galleries and status.
-- This entitlement attaches them to one verified account without granting Hub access.
create table public.rental_legacy_bundles (
  id uuid primary key default gen_random_uuid(),
  owner_slug text not null unique,
  user_id uuid not null unique references auth.users(id),
  full_name text not null,
  email text not null,
  listing_ids text[] not null check(cardinality(listing_ids) between 1 and 50),
  monthly_cents integer not null default 2500 check(monthly_cents>0),
  plan text not null default 'annual' check(plan in ('monthly','annual')),
  checkout_plan text not null default 'annual' check(checkout_plan in ('monthly','annual')),
  annual_cents integer not null check(annual_cents>0),
  approved_at timestamptz not null,
  campaign_started_at timestamptz not null,
  complimentary_until timestamptz not null,
  campaign_metrics jsonb not null default '{}'::jsonb,
  stripe_customer_id text unique,
  stripe_product_id text unique,
  stripe_subscription_id text unique,
  stripe_checkout_id text unique,
  checkout_attempt uuid not null default gen_random_uuid(),
  checkout_pending boolean not null default false,
  checkout_auto_renew boolean not null default false,
  auto_renew boolean not null default false,
  payment_status text not null default 'unpaid',
  paid_until timestamptz,
  risk_hold_until timestamptz,
  terms_accepted_at timestamptz,
  terms_version text,
  invitation_sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.rental_legacy_bundles enable row level security;
revoke all on public.rental_legacy_bundles from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
grant select,insert,update,delete on public.rental_legacy_bundles to service_role;
-- A listing cannot be billed in two partner bundles.
create function public.rental_legacy_bundle_disjoint() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(81246125);
  if exists(select 1 from public.rental_legacy_bundles b where b.id<>new.id and b.listing_ids && new.listing_ids)
    or cardinality(new.listing_ids)<>(select count(distinct x) from unnest(new.listing_ids) x) then
    raise exception 'Listing already assigned to a bundle';
  end if;
  return new;
end $$;
revoke all on function public.rental_legacy_bundle_disjoint() from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
create trigger rental_legacy_bundle_disjoint before insert or update of listing_ids on public.rental_legacy_bundles
for each row execute function public.rental_legacy_bundle_disjoint();
