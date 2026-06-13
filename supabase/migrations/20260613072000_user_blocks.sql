begin;

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  reason text null,
  created_at timestamptz not null default now(),
  constraint user_blocks_not_self check (blocker_id <> blocked_id),
  constraint user_blocks_unique_pair unique (blocker_id, blocked_id)
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_id, created_at desc);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

comment on table public.user_blocks is
  'Personal per-viewer Hide/Block relationships. A block affects only the blocker''s EOD-HUB experience and is not an admin moderation action.';

comment on column public.user_blocks.blocker_id is
  'The user who chose to hide/block another user.';

comment on column public.user_blocks.blocked_id is
  'The user hidden/blocked from the blocker''s own experience.';

alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select_own on public.user_blocks;
create policy user_blocks_select_own
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert_own on public.user_blocks;
create policy user_blocks_insert_own
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid() and blocked_id <> auth.uid());

drop policy if exists user_blocks_delete_own on public.user_blocks;
create policy user_blocks_delete_own
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

commit;
