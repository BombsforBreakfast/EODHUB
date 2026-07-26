-- Collapsing Circuit: event-linked 24h tiles (moved off the main feed).

begin;

alter table public.circuit_posts
  add column if not exists event_id uuid references public.events (id) on delete cascade,
  add column if not exists source_key text;

create unique index if not exists circuit_posts_source_key_uidx
  on public.circuit_posts (source_key)
  where source_key is not null;

create index if not exists circuit_posts_event_id_idx
  on public.circuit_posts (event_id)
  where event_id is not null;

alter table public.circuit_posts
  drop constraint if exists circuit_posts_type_check;

alter table public.circuit_posts
  add constraint circuit_posts_type_check
  check (post_type in ('media', 'thought', 'event'));

alter table public.circuit_posts
  drop constraint if exists circuit_posts_thought_body_check;

alter table public.circuit_posts
  add constraint circuit_posts_thought_body_check check (
    (post_type = 'thought' and body is not null and char_length(body) >= 1)
    or (post_type in ('media', 'event'))
  );

alter table public.circuit_posts
  drop constraint if exists circuit_posts_event_shape_check;

alter table public.circuit_posts
  add constraint circuit_posts_event_shape_check check (
    (post_type = 'event' and event_id is not null)
    or (post_type <> 'event' and event_id is null)
  );

comment on column public.circuit_posts.event_id is
  'When set, this Circuit tile is an ephemeral event promo (RSVP lives on events).';
comment on column public.circuit_posts.source_key is
  'Idempotency key for cron-created tiles, e.g. event_t7:<event_id>.';

commit;
