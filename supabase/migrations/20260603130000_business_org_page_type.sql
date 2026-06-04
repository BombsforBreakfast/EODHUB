begin;

alter table public.business_organization_pages
  add column if not exists page_type text not null default 'business';

alter table public.business_organization_pages
  drop constraint if exists business_org_pages_page_type_check;

alter table public.business_organization_pages
  add constraint business_org_pages_page_type_check
  check (page_type in ('business', 'organization'));

commit;
