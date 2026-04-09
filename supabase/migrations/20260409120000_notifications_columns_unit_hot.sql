-- Richer notifications + one-time "hot" unit post fan-out
begin;

alter table public.notifications
  add column if not exists type text,
  add column if not exists actor_id uuid references auth.users (id) on delete set null,
  add column if not exists post_id uuid references public.posts (id) on delete set null,
  add column if not exists unit_id uuid references public.units (id) on delete set null,
  add column if not exists unit_post_id uuid references public.unit_posts (id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

alter table public.unit_posts
  add column if not exists hot_notified_at timestamptz;

commit;
