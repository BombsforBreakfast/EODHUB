-- Engagement analytics: lightweight session + page-view tracking owned in-app.
-- Vercel Analytics handles raw pageviews/visitors; these tables exist to measure
-- ACTIVE TIME (session duration, time-on-page, daily active time per user) which
-- Vercel does not give us, and to join engagement to authenticated profiles.
--
-- Writes only happen via service-role API routes (RLS deny-by-default for anon/auth).

create extension if not exists pgcrypto;

-- ── analytics_sessions ───────────────────────────────────────────────────────
create table if not exists public.analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_visitor_id text,
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  active_ms bigint not null default 0,
  user_agent_summary text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_sessions_started_idx
  on public.analytics_sessions (started_at desc);
create index if not exists analytics_sessions_user_started_idx
  on public.analytics_sessions (user_id, started_at desc)
  where user_id is not null;
create index if not exists analytics_sessions_anon_started_idx
  on public.analytics_sessions (anonymous_visitor_id, started_at desc)
  where anonymous_visitor_id is not null;

alter table public.analytics_sessions enable row level security;
-- No policies = deny by default. Only service_role (used by API routes) can read/write.

-- ── analytics_page_views ─────────────────────────────────────────────────────
create table if not exists public.analytics_page_views (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.analytics_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  path text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_ms bigint not null default 0
);

create index if not exists analytics_page_views_path_started_idx
  on public.analytics_page_views (path, started_at desc);
create index if not exists analytics_page_views_session_idx
  on public.analytics_page_views (session_id);
create index if not exists analytics_page_views_started_idx
  on public.analytics_page_views (started_at desc);

alter table public.analytics_page_views enable row level security;
-- Same: deny-by-default. Service role only.

-- ── notes ────────────────────────────────────────────────────────────────────
-- A "session" is a continuous browsing window. Heartbeats every 30s while the
-- tab is visible bump active_ms. Wall-clock duration would dramatically
-- overstate engagement (open tab + walk away = false positive), so we only
-- count time the user is actually present.
--
-- A session is treated as ENDED when no heartbeat arrives for >5 minutes.
-- Cleanup of stale open sessions is computed on read in the admin endpoint
-- rather than via a cron job, to keep this migration self-contained.
