-- One-off / scheduled broadcast batches (e.g. inactive-member re-engagement emails).

begin;

create table if not exists public.email_campaign_batches (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null,
  batch_number int not null check (batch_number > 0),
  scheduled_for date not null,
  recipients text[] not null,
  sent_at timestamptz,
  sent_count int not null default 0,
  failed_count int not null default 0,
  failed_recipients text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint email_campaign_batches_campaign_batch_unique unique (campaign_key, batch_number)
);

create index if not exists email_campaign_batches_due_idx
  on public.email_campaign_batches (campaign_key, scheduled_for)
  where sent_at is null;

comment on table public.email_campaign_batches is
  'Scheduled email broadcast batches processed by /api/cron/inactive-member-update-email.';

alter table public.email_campaign_batches enable row level security;

commit;
