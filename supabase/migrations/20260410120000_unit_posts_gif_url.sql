-- Add GIF support to unit_posts
alter table public.unit_posts
  add column if not exists gif_url text;
