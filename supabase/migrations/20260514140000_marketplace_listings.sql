-- Lemon Lot: community classifieds (native + external OG-backed listings).

begin;

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_mode text not null check (listing_mode in ('native', 'external')),
  category text not null,
  subcategory text,
  title text not null,
  description text,
  manual_notes text,
  price text,
  location text,
  mileage integer,
  external_url text,
  og_title text,
  og_description text,
  og_image text,
  og_site_name text,
  status text not null default 'active' check (status in ('active', 'expired', 'removed')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved boolean not null default true,
  featured boolean not null default false,
  tags text[] not null default '{}'::text[]
);

comment on table public.marketplace_listings is
  'Lemon Lot community classifieds; 30-day TTL, native or external (OG) listings.';

create index if not exists marketplace_listings_created_at_idx
  on public.marketplace_listings (created_at desc);

create index if not exists marketplace_listings_user_id_idx
  on public.marketplace_listings (user_id);

create index if not exists marketplace_listings_category_created_idx
  on public.marketplace_listings (category, created_at desc);

create index if not exists marketplace_listings_expires_at_idx
  on public.marketplace_listings (expires_at);

create index if not exists marketplace_listings_tags_gin
  on public.marketplace_listings using gin (tags);

create or replace function public.marketplace_listings_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists marketplace_listings_touch_updated_at on public.marketplace_listings;
create trigger marketplace_listings_touch_updated_at
  before update on public.marketplace_listings
  for each row execute function public.marketplace_listings_touch_updated_at();

alter table public.marketplace_listings enable row level security;

grant select on public.marketplace_listings to anon, authenticated;
grant insert, update on public.marketplace_listings to authenticated;

drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select
  on public.marketplace_listings
  for select
  to anon, authenticated
  using (
    (
      coalesce(approved, false) = true
      and status = 'active'
      and expires_at > now()
    )
    or (
      auth.uid() is not null
      and status <> 'removed'
      and coalesce(approved, false) = true
      and expires_at > (now() - interval '90 days')
    )
    or (
      auth.uid() is not null
      and user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false)
    )
  );

drop policy if exists marketplace_listings_insert_own on public.marketplace_listings;
create policy marketplace_listings_insert_own
  on public.marketplace_listings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists marketplace_listings_update_owner on public.marketplace_listings;
create policy marketplace_listings_update_owner
  on public.marketplace_listings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists marketplace_listings_update_admin on public.marketplace_listings;
create policy marketplace_listings_update_admin
  on public.marketplace_listings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false)
    )
  )
  with check (true);

commit;
