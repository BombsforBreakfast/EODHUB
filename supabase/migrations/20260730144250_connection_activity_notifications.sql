-- Preference for Know-graph activity alerts (posts + job shares from accepted connections).
alter table public.notification_preferences
  add column if not exists know_activity_notifications boolean not null default true;

comment on column public.notification_preferences.know_activity_notifications is
  'When true, notify about posts and job shares from accepted Know connections.';
