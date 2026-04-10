-- Add image and GIF support to unit post comments (mirrors post_comments table)
alter table public.unit_post_comments
  add column if not exists image_url text,
  add column if not exists gif_url text;
