-- Event cover image on events table; link feed posts to events for RSVP UI on the feed.
alter table public.events
  add column if not exists image_url text;

alter table public.posts
  add column if not exists event_id uuid references public.events (id) on delete set null;

create index if not exists idx_posts_event_id on public.posts (event_id)
  where event_id is not null;
