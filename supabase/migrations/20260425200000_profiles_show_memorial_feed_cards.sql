-- Home feed: optional opt-out of large "In Memoriam" anniversary post cards.
-- Calendars and /events are unchanged; this column only controls the home feed block.

begin;

alter table public.profiles
  add column if not exists show_memorial_feed_cards boolean not null default true;

comment on column public.profiles.show_memorial_feed_cards is
  'When false, do not show memorial anniversary post cards on the home feed. Does not affect calendar or Events page.';

commit;
