-- Track one-time welcome Sidebar DM from founder (idempotent ensure + backfill skip).

alter table public.profiles
  add column if not exists welcome_sidebar_sent_at timestamptz;

comment on column public.profiles.welcome_sidebar_sent_at is
  'Set when the automated founder welcome Sidebar message was sent or intentionally skipped (already engaged / exempt).';

create index if not exists idx_profiles_welcome_sidebar_pending
  on public.profiles (user_id)
  where welcome_sidebar_sent_at is null;
