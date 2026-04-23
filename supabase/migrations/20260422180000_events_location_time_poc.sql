-- Add optional location/time/POC fields to events.
--
-- These were requested on the events page "Add Event" form so organizers can
-- include a meeting address, a time-of-day (separate from the date), and a
-- point-of-contact name + phone number for the event.
--
-- All four columns are nullable text — there is no reason to validate the time
-- as a structured value (organizers will write things like "0900-1100 EST" or
-- "6 PM doors").

alter table public.events
  add column if not exists location text,
  add column if not exists event_time text,
  add column if not exists poc_name text,
  add column if not exists poc_phone text;

comment on column public.events.location is
  'Free-form address or venue (e.g. "1234 Main St, Norfolk, VA" or "Online — Zoom").';
comment on column public.events.event_time is
  'Free-form time-of-day (e.g. "6:00 PM EST" or "0900-1100"). Stored as text — keeps date column normalized.';
comment on column public.events.poc_name is 'Point-of-contact name for the event.';
comment on column public.events.poc_phone is 'Point-of-contact phone number for the event (free-form text).';
