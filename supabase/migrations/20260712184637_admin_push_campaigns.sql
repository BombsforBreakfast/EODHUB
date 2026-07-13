-- Admin-created immediate and scheduled native push campaigns.

begin;

create table if not exists public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null,
  body text not null,
  link text,
  scheduled_for timestamptz not null default now(),
  status text not null default 'scheduled',
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  invalid_token_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_campaigns_title_length_chk
    check (char_length(trim(title)) between 1 and 100),
  constraint push_campaigns_body_length_chk
    check (char_length(trim(body)) between 1 and 500),
  constraint push_campaigns_link_chk
    check (link is null or (char_length(link) between 1 and 500 and link like '/%')),
  constraint push_campaigns_status_chk
    check (status in ('scheduled', 'processing', 'sent', 'failed', 'canceled')),
  constraint push_campaigns_counts_chk
    check (sent_count >= 0 and failed_count >= 0 and invalid_token_count >= 0)
);

create index if not exists push_campaigns_due_idx
  on public.push_campaigns (scheduled_for, created_at)
  where status = 'scheduled';

alter table public.push_campaigns enable row level security;

-- Browser clients never access campaigns directly. Admin and cron route handlers
-- use the service role after independently authenticating the caller.
revoke all on table public.push_campaigns from anon, authenticated;

create or replace function public.touch_push_campaigns_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_push_campaigns_updated_at on public.push_campaigns;
create trigger trg_push_campaigns_updated_at
before update on public.push_campaigns
for each row execute function public.touch_push_campaigns_updated_at();

-- Atomically claims due work so retries or overlapping cron invocations cannot
-- send the same campaign twice.
create or replace function public.claim_due_push_campaigns(p_limit integer default 5)
returns setof public.push_campaigns
language sql
security invoker
set search_path = ''
as $$
  update public.push_campaigns
  set status = 'processing',
      started_at = now(),
      last_error = null
  where id in (
    select id
    from public.push_campaigns
    where status = 'scheduled'
      and scheduled_for <= now()
    order by scheduled_for, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  )
  returning *;
$$;

revoke all on function public.claim_due_push_campaigns(integer) from public, anon, authenticated;
grant execute on function public.claim_due_push_campaigns(integer) to service_role;

-- A device token belongs to the currently signed-in account only. Remove older
-- cross-account copies before enforcing global uniqueness.
delete from public.push_device_tokens older
using public.push_device_tokens newer
where older.token = newer.token
  and (
    older.last_seen_at < newer.last_seen_at
    or (older.last_seen_at = newer.last_seen_at and older.id < newer.id)
  );

alter table public.push_device_tokens
  drop constraint if exists push_device_tokens_token_unique;

alter table public.push_device_tokens
  add constraint push_device_tokens_token_unique unique (token);

commit;
