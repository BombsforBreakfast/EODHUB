-- Audit log for proxied GIPHY API calls (trending + search).
-- Powers hourly usage monitoring on the admin Infrastructure tab.

begin;

create table if not exists public.giphy_api_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  endpoint text not null,
  user_id uuid null references auth.users (id) on delete set null,
  constraint giphy_api_calls_endpoint_chk
    check (endpoint in ('trending', 'search'))
);

comment on table public.giphy_api_calls is
  'Proxied GIPHY API requests. Service role only; used for hourly quota monitoring.';

create index if not exists giphy_api_calls_created_at_idx
  on public.giphy_api_calls (created_at desc);

alter table public.giphy_api_calls enable row level security;

commit;
