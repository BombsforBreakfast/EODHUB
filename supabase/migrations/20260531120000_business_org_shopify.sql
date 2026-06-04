alter table public.business_organization_pages
  add column if not exists shopify_store_domain text,
  add column if not exists shopify_admin_access_token text,
  add column if not exists shopify_last_synced_at timestamptz;

alter table public.business_org_products
  add column if not exists external_source text,
  add column if not exists external_id text;

create unique index if not exists business_org_products_external_unique_idx
  on public.business_org_products (business_org_page_id, external_source, external_id)
  where external_source is not null and external_id is not null;
