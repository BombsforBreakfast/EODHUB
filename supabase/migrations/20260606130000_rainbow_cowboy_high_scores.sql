begin;

create table if not exists public.rainbow_cowboy_high_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  level_id text not null,
  level_slug text not null,
  score integer not null,
  rank text,
  completed boolean not null default true,
  duration_seconds integer,
  drones_eaten integer not null default 0,
  balloons_survived integer not null default 0,
  rainbow_blasts_used integer not null default 0,
  damage_taken integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rainbow_cowboy_high_scores_user_level_unique unique (user_id, level_id)
);

create index if not exists rainbow_cowboy_high_scores_user_id_idx
  on public.rainbow_cowboy_high_scores (user_id);

create index if not exists rainbow_cowboy_high_scores_level_id_idx
  on public.rainbow_cowboy_high_scores (level_id);

alter table public.rainbow_cowboy_high_scores enable row level security;

create policy "rainbow_cowboy_high_scores_select_own"
  on public.rainbow_cowboy_high_scores
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "rainbow_cowboy_high_scores_insert_own"
  on public.rainbow_cowboy_high_scores
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "rainbow_cowboy_high_scores_update_own"
  on public.rainbow_cowboy_high_scores
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.rainbow_cowboy_high_scores is
  'Personal best scores for the Rainbow Cowboy arcade game. One row per user per level.';

commit;
