-- Native push notification device tokens and per-user push preference.

begin;

alter table public.notification_preferences
  add column if not exists push_notifications boolean not null default true;

comment on column public.notification_preferences.push_notifications is
  'Master switch for native iOS/Android push notifications.';

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  token text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_device_tokens_platform_chk
    check (platform in ('ios', 'android')),
  constraint push_device_tokens_token_len_chk
    check (char_length(token) between 32 and 512),
  constraint push_device_tokens_user_token_unique unique (user_id, token)
);

comment on table public.push_device_tokens is
  'APNs/FCM device tokens registered from native Capacitor shells.';

create index if not exists push_device_tokens_user_platform_idx
  on public.push_device_tokens (user_id, platform, last_seen_at desc);

alter table public.notifications
  add column if not exists pushed_at timestamptz;

comment on column public.notifications.pushed_at is
  'When a native push was successfully dispatched for this notification row.';

create index if not exists notifications_push_pending_idx
  on public.notifications (recipient_user_id, created_at desc)
  where pushed_at is null and archived_at is null;

create or replace function public.touch_push_device_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_push_device_tokens_updated_at on public.push_device_tokens;
create trigger trg_push_device_tokens_updated_at
before update on public.push_device_tokens
for each row execute procedure public.touch_push_device_tokens_updated_at();

alter table public.push_device_tokens enable row level security;

drop policy if exists "Users can read their push device tokens" on public.push_device_tokens;
create policy "Users can read their push device tokens"
on public.push_device_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their push device tokens" on public.push_device_tokens;
create policy "Users can insert their push device tokens"
on public.push_device_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their push device tokens" on public.push_device_tokens;
create policy "Users can update their push device tokens"
on public.push_device_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their push device tokens" on public.push_device_tokens;
create policy "Users can delete their push device tokens"
on public.push_device_tokens
for delete
to authenticated
using (auth.uid() = user_id);

commit;
