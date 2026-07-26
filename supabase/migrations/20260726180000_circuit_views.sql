-- Collapsing Circuit: per-viewer seen state for unseen rings / sort.

begin;

create table if not exists public.circuit_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.circuit_posts (id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists circuit_views_post_idx
  on public.circuit_views (post_id);

create index if not exists circuit_views_user_seen_idx
  on public.circuit_views (user_id, seen_at desc);

alter table public.circuit_views enable row level security;

drop policy if exists circuit_views_select_own on public.circuit_views;
create policy circuit_views_select_own
  on public.circuit_views
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists circuit_views_insert_own on public.circuit_views;
create policy circuit_views_insert_own
  on public.circuit_views
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists circuit_views_update_own on public.circuit_views;
create policy circuit_views_update_own
  on public.circuit_views
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists circuit_views_delete_own on public.circuit_views;
create policy circuit_views_delete_own
  on public.circuit_views
  for delete
  to authenticated
  using (user_id = auth.uid());

comment on table public.circuit_views is
  'Per-member seen markers for Collapsing Circuit tiles. Used for unseen rings and strip sort.';

commit;
