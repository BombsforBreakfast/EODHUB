begin;

alter table public.news_items
  add column if not exists admin_manual_image_url text null;

comment on column public.news_items.admin_manual_image_url is
  'Optional admin-provided image URL for feed previews; takes priority over scraped thumbnail_url/og_image.';

commit;
