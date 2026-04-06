-- Tracks last automated re-engagement email (cooldown + debugging).
alter table public.profiles
  add column if not exists reengagement_email_sent_at timestamptz;

comment on column public.profiles.reengagement_email_sent_at is
  'Last time this user received the scheduled re-engagement digest email.';
