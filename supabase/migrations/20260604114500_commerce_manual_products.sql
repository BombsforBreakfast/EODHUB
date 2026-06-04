begin;

alter table public.commerce_sources
  drop constraint if exists commerce_sources_platform_type_check;

alter table public.commerce_sources
  add constraint commerce_sources_platform_type_check check (
    platform_type in ('shopify', 'manual')
  );

alter table public.commerce_products
  drop constraint if exists commerce_products_platform_type_check;

alter table public.commerce_products
  add constraint commerce_products_platform_type_check check (
    platform_type in ('shopify', 'manual')
  );

commit;
