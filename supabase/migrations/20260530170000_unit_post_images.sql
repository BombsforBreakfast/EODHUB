-- Multi-image attachments for group (unit) wall posts — mirrors feed post_images.

create table if not exists public.unit_post_images (
  id uuid primary key default gen_random_uuid(),
  unit_post_id uuid not null references public.unit_posts(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists unit_post_images_post_sort_idx
  on public.unit_post_images (unit_post_id, sort_order, created_at);

alter table public.unit_post_images enable row level security;
-- Writes via service-role API routes only (same pattern as post_images).
