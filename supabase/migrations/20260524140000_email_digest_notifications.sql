-- Email digest preferences, send ledger, and Supabase-side scheduling.
-- The digest endpoint remains protected by DIGEST_CRON_SECRET.

begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_notifications boolean not null default true,
  morning_digest boolean not null default true,
  evening_digest boolean not null default true,
  timezone text not null default 'America/New_York',
  digest_frequency text not null default 'twice_daily',
  last_digest_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_digest_frequency_chk
    check (digest_frequency in ('twice_daily', 'daily', 'off')),
  constraint notification_preferences_timezone_chk
    check (char_length(timezone) between 1 and 64)
);

comment on table public.notification_preferences is
  'Per-user email notification and digest settings.';
comment on column public.notification_preferences.timezone is
  'Reserved for future per-user scheduling. Beta digest sends use America/New_York as the operating timezone.';

create table if not exists public.digest_send_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  digest_type text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  sent_at timestamptz not null default now(),
  status text not null,
  resend_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digest_send_logs_digest_type_chk
    check (digest_type in ('morning', 'evening')),
  constraint digest_send_logs_status_chk
    check (status in ('sending', 'sent', 'skipped', 'failed')),
  constraint digest_send_logs_window_chk
    check (window_start < window_end)
);

comment on table public.digest_send_logs is
  'Audit and idempotency ledger for Resend email digest attempts.';
comment on column public.digest_send_logs.status is
  'sending claims a user/window before Resend is called; sent blocks duplicate sends; skipped/failed preserve audit history.';

create index if not exists notification_preferences_email_enabled_idx
  on public.notification_preferences (email_notifications, digest_frequency);

create index if not exists digest_send_logs_sent_at_idx
  on public.digest_send_logs (sent_at desc);

create index if not exists digest_send_logs_user_sent_at_idx
  on public.digest_send_logs (user_id, sent_at desc);

create index if not exists digest_send_logs_status_sent_at_idx
  on public.digest_send_logs (status, sent_at desc);

create unique index if not exists digest_send_logs_active_send_unique_idx
  on public.digest_send_logs (user_id, digest_type, window_start, window_end)
  where status in ('sending', 'sent');

create or replace function public.touch_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_updated_at
before update on public.notification_preferences
for each row execute procedure public.touch_notification_preferences_updated_at();

create or replace function public.touch_digest_send_logs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_digest_send_logs_updated_at on public.digest_send_logs;
create trigger trg_digest_send_logs_updated_at
before update on public.digest_send_logs
for each row execute procedure public.touch_digest_send_logs_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.digest_send_logs enable row level security;

drop policy if exists "Users can read their notification preferences" on public.notification_preferences;
create policy "Users can read their notification preferences"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their notification preferences" on public.notification_preferences;
create policy "Users can insert their notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their notification preferences" on public.notification_preferences;
create policy "Users can update their notification preferences"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read their digest send logs" on public.digest_send_logs;
create policy "Users can read their digest send logs"
on public.digest_send_logs
for select
to authenticated
using (auth.uid() = user_id);

-- Supabase pg_cron + pg_net scheduling. If pg_cron is unavailable on the
-- current Supabase plan, use an external timezone-aware scheduler to POST the
-- same payloads to /api/cron/email-digest with Authorization: Bearer <secret>.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- Store the secret once after deploying this migration:
--   select vault.create_secret(
--     '<same value as Vercel DIGEST_CRON_SECRET>',
--     'digest_cron_secret',
--     'Bearer token for /api/cron/email-digest'
--   );
--
-- The four UTC jobs below intentionally cover Eastern daylight and standard
-- time. The endpoint only sends when the current America/New_York local time
-- matches the requested digest window, so the off-season job becomes a no-op.

do $$
begin
  perform cron.unschedule('email-digest-morning-edt');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-morning-est');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-evening-edt');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-evening-est');
exception when others then
  null;
end $$;

select cron.schedule(
  'email-digest-morning-edt',
  '30 10 * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/email-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret' limit 1),
          ''
        )
      ),
      body := '{"digestType":"morning"}'::jsonb
    );
  $$
);

select cron.schedule(
  'email-digest-morning-est',
  '30 11 * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/email-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret' limit 1),
          ''
        )
      ),
      body := '{"digestType":"morning"}'::jsonb
    );
  $$
);

select cron.schedule(
  'email-digest-evening-edt',
  '30 21 * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/email-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret' limit 1),
          ''
        )
      ),
      body := '{"digestType":"evening"}'::jsonb
    );
  $$
);

select cron.schedule(
  'email-digest-evening-est',
  '30 22 * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/email-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'digest_cron_secret' limit 1),
          ''
        )
      ),
      body := '{"digestType":"evening"}'::jsonb
    );
  $$
);

commit;
