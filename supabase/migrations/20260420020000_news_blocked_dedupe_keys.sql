-- Persistent blocklist for news ingestion candidates that the admin has
-- dismissed from the preview pane. The runner consults this list before
-- scoring so junk we've already triaged never re-enters the pipeline,
-- even if the same dedupe_key reappears in a future feed/discovery batch.
--
-- We key on dedupe_key (sha1 of canonical/source URL or host+headline) so a
-- single dismiss covers all providers that link to the same story.
--
-- Reversible: an admin can `delete from news_blocked_dedupe_keys where ...`
-- to un-block, or we can add an unblock UI later.

create table if not exists public.news_blocked_dedupe_keys (
  dedupe_key text primary key,
  reason text,
  -- Snapshot the most useful identifying info at dismiss time so an admin
  -- reviewing the blocklist months later doesn't have to dig.
  headline text,
  source_url text,
  source_name text,
  blocked_at timestamptz not null default now(),
  blocked_by uuid references auth.users(id) on delete set null
);

create index if not exists news_blocked_dedupe_keys_blocked_at_idx
  on public.news_blocked_dedupe_keys (blocked_at desc);

alter table public.news_blocked_dedupe_keys enable row level security;

-- Reads gated by is_admin. Writes go through service_role from the API
-- (no client-side write policy by design).
drop policy if exists news_blocked_dedupe_keys_admin_read on public.news_blocked_dedupe_keys;
create policy news_blocked_dedupe_keys_admin_read
  on public.news_blocked_dedupe_keys
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.user_id = auth.uid() and profiles.is_admin = true
    )
  );
