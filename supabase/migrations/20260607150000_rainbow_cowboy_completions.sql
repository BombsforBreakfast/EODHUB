begin;

create table if not exists public.rainbow_cowboy_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  level_id text not null,
  difficulty text not null,
  completed_at timestamptz not null default now(),
  constraint rainbow_cowboy_completions_pkey primary key (user_id, level_id, difficulty),
  constraint rainbow_cowboy_completions_difficulty_check
    check (difficulty in ('easy', 'novice', 'hard'))
);

create index if not exists rainbow_cowboy_completions_user_id_idx
  on public.rainbow_cowboy_completions (user_id);

alter table public.rainbow_cowboy_completions enable row level security;

create policy "rainbow_cowboy_completions_select_own"
  on public.rainbow_cowboy_completions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "rainbow_cowboy_completions_insert_own"
  on public.rainbow_cowboy_completions
  for insert
  to authenticated
  with check (user_id = auth.uid());

comment on table public.rainbow_cowboy_completions is
  'Per-level difficulty clears for Unicorn Hero progression unlocks.';

commit;
