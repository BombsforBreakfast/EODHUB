-- Add listing type for Biz/Org/Resources classification.
alter table if exists public.business_listings
  add column if not exists listing_type text;

update public.business_listings
set listing_type = 'business'
where listing_type is null;

-- Mark known nonprofit/community links as resources.
update public.business_listings
set listing_type = 'resource'
where
  lower(coalesce(website_url, '')) like '%thelongwalkhome.org%'
  or lower(coalesce(website_url, '')) like '%eod-wf.org%'
  or lower(coalesce(website_url, '')) like '%eodwarriorfoundation.org%'
  or lower(coalesce(business_name, '')) like '%long walk%'
  or lower(coalesce(business_name, '')) like '%eod warrior foundation%'
  or lower(coalesce(og_title, '')) like '%long walk%'
  or lower(coalesce(og_title, '')) like '%eod warrior foundation%'
  or lower(coalesce(og_site_name, '')) like '%long walk%'
  or lower(coalesce(og_site_name, '')) like '%eod warrior foundation%';

alter table if exists public.business_listings
  alter column listing_type set default 'business';

alter table if exists public.business_listings
  drop constraint if exists business_listings_listing_type_check;

alter table if exists public.business_listings
  add constraint business_listings_listing_type_check
  check (listing_type in ('business', 'organization', 'resource'));

create index if not exists business_listings_listing_type_idx
  on public.business_listings (listing_type);

