-- Platform-agnostic commerce layer for business organization pages.
-- business_id references business_organization_pages (the business profile record).

create table if not exists public.commerce_sources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_organization_pages (id) on delete cascade,
  platform_type text not null default 'shopify',
  store_name text,
  store_url text,
  shop_domain text,
  api_enabled boolean not null default false,
  sync_status text not null default 'not_configured',
  last_synced_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  shopify_client_id text,
  shopify_client_secret_encrypted text,
  shopify_access_token_encrypted text,
  shopify_token_expires_at timestamptz,
  shopify_scope text,
  shopify_installation_status text not null default 'not_installed',
  constraint commerce_sources_sync_status_check check (
    sync_status in ('not_configured', 'pending', 'connected', 'sync_failed', 'disabled')
  ),
  constraint commerce_sources_platform_type_check check (
    platform_type in ('shopify')
  ),
  constraint commerce_sources_shopify_installation_status_check check (
    shopify_installation_status in ('not_installed', 'pending', 'installed', 'revoked')
  )
);

create unique index if not exists commerce_sources_business_platform_idx
  on public.commerce_sources (business_id, platform_type);

create index if not exists commerce_sources_business_idx
  on public.commerce_sources (business_id, created_at desc);

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_organization_pages (id) on delete cascade,
  commerce_source_id uuid not null references public.commerce_sources (id) on delete cascade,
  platform_type text not null default 'shopify',
  external_product_id text not null,
  title text not null,
  description text,
  image_url text,
  price numeric(12, 2),
  currency text not null default 'USD',
  product_url text,
  checkout_url text,
  inventory_status text,
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  raw_shopify_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_products_platform_type_check check (
    platform_type in ('shopify')
  ),
  constraint commerce_products_title_len check (
    char_length(trim(title)) >= 1 and char_length(title) <= 200
  )
);

create unique index if not exists commerce_products_source_external_idx
  on public.commerce_products (commerce_source_id, external_product_id);

create index if not exists commerce_products_business_active_idx
  on public.commerce_products (business_id, is_active, sort_order, created_at desc);

create or replace function public.touch_commerce_sources_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_commerce_sources_touch_updated_at on public.commerce_sources;
create trigger trg_commerce_sources_touch_updated_at
  before update on public.commerce_sources
  for each row execute function public.touch_commerce_sources_updated_at();

create or replace function public.touch_commerce_products_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_commerce_products_touch_updated_at on public.commerce_products;
create trigger trg_commerce_products_touch_updated_at
  before update on public.commerce_products
  for each row execute function public.touch_commerce_products_updated_at();

alter table public.commerce_sources enable row level security;
alter table public.commerce_products enable row level security;

-- Public: active products on approved business pages only.
drop policy if exists commerce_products_public_select_active on public.commerce_products;
create policy commerce_products_public_select_active
  on public.commerce_products
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_products.business_id
        and p.is_active = true
        and p.verification_status = 'approved'
    )
  );

-- Owners, business auth users, admins can read all products for their business.
drop policy if exists commerce_products_select_owner_or_admin on public.commerce_products;
create policy commerce_products_select_owner_or_admin
  on public.commerce_products
  for select
  to authenticated
  using (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_products.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists commerce_products_update_owner_or_admin on public.commerce_products;
create policy commerce_products_update_owner_or_admin
  on public.commerce_products
  for update
  to authenticated
  using (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_products.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  )
  with check (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_products.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists commerce_products_admin_all on public.commerce_products;
create policy commerce_products_admin_all
  on public.commerce_products
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

-- Commerce sources: no public access. Owners/admins only.
drop policy if exists commerce_sources_select_owner_or_admin on public.commerce_sources;
create policy commerce_sources_select_owner_or_admin
  on public.commerce_sources
  for select
  to authenticated
  using (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_sources.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists commerce_sources_insert_owner_or_admin on public.commerce_sources;
create policy commerce_sources_insert_owner_or_admin
  on public.commerce_sources
  for insert
  to authenticated
  with check (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_sources.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists commerce_sources_update_owner_or_admin on public.commerce_sources;
create policy commerce_sources_update_owner_or_admin
  on public.commerce_sources
  for update
  to authenticated
  using (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_sources.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  )
  with check (
    public.is_current_user_admin()
    or exists (
      select 1
      from public.business_organization_pages p
      where p.id = commerce_sources.business_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists commerce_sources_admin_all on public.commerce_sources;
create policy commerce_sources_admin_all
  on public.commerce_sources
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());
