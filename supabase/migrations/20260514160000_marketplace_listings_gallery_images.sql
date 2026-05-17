-- Lemon Lot: user-uploaded gallery (public URLs); card prefers gallery over OG image.

begin;

alter table public.marketplace_listings
  add column if not exists gallery_images text[] not null default '{}'::text[];

comment on column public.marketplace_listings.gallery_images is
  'Up to 10 public image URLs (e.g. feed-images bucket); listing card uses gallery before og_image.';

commit;
