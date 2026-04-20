-- News ingestion v1
--
-- Stores external news stories surfaced into the main feed as a distinct
-- "Newswire" card type. Writes happen exclusively from the server-side
-- ingestion runner (service_role); reads are allowed for everyone but only
-- for items that have been explicitly approved by an admin (status = 'published').
--
-- Approval flow:
--   - Ingestion inserts rows with status = 'pending' (default).
--   - Admin reviews in the Admin Panel "News" tab and flips status to
--     'published' or 'rejected' via /api/admin/news.
--   - Only 'published' rows are visible in the public feed.
--
-- This keeps the news feature dark until the relevance scoring + filtering
-- have been validated against real ingest output.

create extension if not exists pgcrypto;

-- ── news_items ──────────────────────────────────────────────────────────────
create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  source_name text,
  source_url text not null,
  canonical_url text,
  summary text,
  thumbnail_url text,
  published_at timestamptz,
  ingested_at timestamptz not null default now(),
  tags text[] not null default '{}',
  relevance_score numeric,
  dedupe_key text not null,
  raw_payload jsonb,
  content_type text not null default 'news',
  is_satire boolean not null default false,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint news_items_status_chk check (status in ('pending', 'published', 'rejected'))
);

create unique index if not exists news_items_dedupe_key_uniq
  on public.news_items (dedupe_key);
create index if not exists news_items_published_at_idx
  on public.news_items (published_at desc);
create index if not exists news_items_created_at_idx
  on public.news_items (created_at desc);
create index if not exists news_items_tags_gin
  on public.news_items using gin (tags);
create index if not exists news_items_published_status_idx
  on public.news_items (status, published_at desc)
  where status = 'published';
create index if not exists news_items_pending_created_idx
  on public.news_items (status, created_at desc)
  where status = 'pending';

alter table public.news_items enable row level security;

-- Public read access ONLY for approved items. Pending/rejected are invisible
-- to anon + authenticated; admins read pending via the service-role API.
drop policy if exists "news_items public read published" on public.news_items;
create policy "news_items public read published"
  on public.news_items
  for select
  to anon, authenticated
  using (status = 'published');

-- No insert/update/delete policies → service_role only (matches the pattern
-- used by analytics_sessions / analytics_page_views).

-- ── pg_cron + pg_net hourly ingestion ───────────────────────────────────────
-- Calls the Next.js ingestion endpoint. The endpoint is idempotent (unique
-- dedupe_key) and self-caps daily volume, so frequent invocations are safe.
--
-- ONE-TIME SETUP (run by an admin out of band, NOT in this migration):
--
--   alter database postgres set app.news_cron_secret = '<long-random-string>';
--
-- The same secret value must be set on the Vercel project as NEWS_CRON_SECRET.
-- Without it the cron call will be rejected by the API route.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any prior schedule with the same name so this migration is rerunnable.
do $$
begin
  perform cron.unschedule('news-ingest-hourly');
exception when others then
  null;
end $$;

select cron.schedule(
  'news-ingest-hourly',
  '17 * * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/news-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(current_setting('app.news_cron_secret', true), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
