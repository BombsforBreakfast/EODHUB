begin;

create table if not exists public.feed_videos (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  unit_post_id uuid references public.unit_posts(id) on delete set null,
  sort_order integer not null default 0,
  status text not null default 'waiting_for_upload'
    check (status in (
      'waiting_for_upload',
      'uploading',
      'processing',
      'ready',
      'upload_failed',
      'asset_error',
      'cancelled',
      'timed_out',
      'deleting',
      'deleted'
    )),
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text,
  source_filename text not null,
  source_mime_type text not null,
  source_size_bytes bigint not null check (source_size_bytes > 0),
  upload_expires_at timestamptz,
  duration_seconds numeric,
  aspect_ratio text,
  max_stored_resolution text,
  error_type text,
  error_messages jsonb,
  ready_at timestamptz,
  delete_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (post_id is not null and unit_post_id is not null))
);

create index if not exists feed_videos_post_sort_idx
  on public.feed_videos (post_id, sort_order, created_at)
  where post_id is not null;

create index if not exists feed_videos_unit_post_sort_idx
  on public.feed_videos (unit_post_id, sort_order, created_at)
  where unit_post_id is not null;

create index if not exists feed_videos_owner_status_idx
  on public.feed_videos (owner_user_id, status, created_at desc);

create table if not exists public.mux_webhook_events (
  mux_event_id text primary key,
  event_type text not null,
  object_id text,
  payload jsonb not null,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feed_videos enable row level security;
alter table public.mux_webhook_events enable row level security;

drop policy if exists "Authenticated users can read feed videos" on public.feed_videos;
create policy "Authenticated users can read feed videos"
  on public.feed_videos
  for select
  to authenticated
  using (true);

revoke all on public.feed_videos from anon;
revoke all on public.mux_webhook_events from anon, authenticated;
grant select on public.feed_videos to authenticated;

commit;
