-- Free-form tags for directory listings (e.g. veteran-owned, job placement)
alter table public.business_listings
  add column if not exists tags text[] not null default '{}';

create index if not exists business_listings_tags_gin
  on public.business_listings using gin (tags);
