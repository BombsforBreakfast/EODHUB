begin;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.handle_bsm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Player'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created_bsm
  after insert on auth.users
  for each row execute function public.handle_bsm_new_user();

create table public.bsm_high_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id text not null,
  level_slug text not null,
  score integer not null,
  rank text,
  completed boolean not null default true,
  duration_seconds integer,
  difficulty text not null default 'easy'
    check (difficulty in ('easy', 'novice', 'hard')),
  drones_eaten integer not null default 0,
  balloons_survived integer not null default 0,
  rainbow_blasts_used integer not null default 0,
  damage_taken integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bsm_high_scores_user_level_unique unique (user_id, level_id)
);

create index bsm_high_scores_user_id_idx on public.bsm_high_scores (user_id);
create index bsm_high_scores_leaderboard_idx
  on public.bsm_high_scores (level_id, score desc, duration_seconds asc nulls last, completed_at asc)
  where completed = true;

alter table public.bsm_high_scores enable row level security;

create policy "bsm_high_scores_select_own"
  on public.bsm_high_scores for select to authenticated
  using (user_id = auth.uid());

create policy "bsm_high_scores_insert_own"
  on public.bsm_high_scores for insert to authenticated
  with check (user_id = auth.uid());

create policy "bsm_high_scores_update_own"
  on public.bsm_high_scores for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.bsm_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  level_id text not null,
  difficulty text not null check (difficulty in ('easy', 'novice', 'hard')),
  completed_at timestamptz not null default now(),
  primary key (user_id, level_id, difficulty)
);

alter table public.bsm_completions enable row level security;

create policy "bsm_completions_select_own"
  on public.bsm_completions for select to authenticated
  using (user_id = auth.uid());

create policy "bsm_completions_insert_own"
  on public.bsm_completions for insert to authenticated
  with check (user_id = auth.uid());

create policy "bsm_completions_update_own"
  on public.bsm_completions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.get_bsm_personal_bests()
returns table (
  level_id text,
  score integer,
  rank text,
  duration_seconds integer,
  difficulty text,
  drones_eaten integer
)
language sql stable security invoker set search_path = ''
as $$
  select hs.level_id, hs.score, hs.rank, hs.duration_seconds, hs.difficulty, hs.drones_eaten
  from public.bsm_high_scores hs
  where hs.user_id = auth.uid() and hs.completed = true;
$$;

grant execute on function public.get_bsm_personal_bests() to authenticated;

create or replace function public.get_bsm_leaderboard(p_level_id text, p_limit integer default 10)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  score integer,
  rank text,
  duration_seconds integer,
  difficulty text,
  completed_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    hs.user_id,
    coalesce(nullif(trim(p.display_name), ''), 'Player') as display_name,
    p.avatar_url,
    hs.score, hs.rank, hs.duration_seconds, hs.difficulty, hs.completed_at
  from public.bsm_high_scores hs
  join public.profiles p on p.user_id = hs.user_id
  where hs.level_id = p_level_id and hs.completed = true
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_bsm_leaderboard(text, integer) to authenticated;

create or replace function public.record_bsm_run(
  p_level_id text,
  p_level_slug text,
  p_score integer,
  p_rank text,
  p_duration_seconds integer,
  p_difficulty text,
  p_drones_eaten integer,
  p_balloons_survived integer,
  p_rainbow_blasts_used integer,
  p_damage_taken integer,
  p_completed_at timestamptz
)
returns table (
  saved boolean,
  is_new_score_best boolean,
  is_new_time_best boolean,
  previous_best integer,
  current_best integer,
  previous_best_time integer,
  current_best_time integer,
  level_id text,
  score integer,
  rank text,
  duration_seconds integer,
  drones_eaten integer,
  difficulty text
)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_has_existing boolean := false;
  v_score_improved boolean;
  v_time_improved boolean;
  v_next_score integer;
  v_next_rank text;
  v_next_duration integer;
  v_next_difficulty text;
  v_next_drones_eaten integer;
  v_next_balloons_survived integer;
  v_next_rainbow_blasts_used integer;
  v_next_damage_taken integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_level_id is null or btrim(p_level_id) = '' then
    raise exception 'level_id is required';
  end if;

  if p_difficulty not in ('easy', 'novice', 'hard') then
    raise exception 'invalid difficulty';
  end if;

  insert into public.bsm_completions (user_id, level_id, difficulty, completed_at)
  values (v_user_id, p_level_id, p_difficulty, coalesce(p_completed_at, now()))
  on conflict (user_id, level_id, difficulty) do update
    set completed_at = least(public.bsm_completions.completed_at, excluded.completed_at);

  select * into v_existing
  from public.bsm_high_scores hs
  where hs.user_id = v_user_id and hs.level_id = p_level_id
  limit 1;
  v_has_existing := found;

  v_score_improved := not v_has_existing or p_score > v_existing.score;
  v_time_improved := not v_has_existing
    or v_existing.duration_seconds is null
    or (p_duration_seconds is not null and p_duration_seconds < v_existing.duration_seconds);

  if not v_score_improved and not v_time_improved then
    return query select false, false, false, v_existing.score, v_existing.score,
      v_existing.duration_seconds, v_existing.duration_seconds,
      v_existing.level_id, v_existing.score, v_existing.rank,
      v_existing.duration_seconds, v_existing.drones_eaten, v_existing.difficulty;
    return;
  end if;

  v_next_score := case when v_score_improved then p_score else v_existing.score end;
  v_next_rank := case when v_score_improved then p_rank else v_existing.rank end;
  v_next_duration := case when v_time_improved then p_duration_seconds else v_existing.duration_seconds end;
  v_next_difficulty := case when v_score_improved then p_difficulty else coalesce(v_existing.difficulty, p_difficulty) end;
  v_next_drones_eaten := case when v_score_improved then coalesce(p_drones_eaten, 0) else coalesce(v_existing.drones_eaten, 0) end;
  v_next_balloons_survived := case when v_score_improved then coalesce(p_balloons_survived, 0) else coalesce(v_existing.balloons_survived, 0) end;
  v_next_rainbow_blasts_used := case when v_score_improved then coalesce(p_rainbow_blasts_used, 0) else coalesce(v_existing.rainbow_blasts_used, 0) end;
  v_next_damage_taken := case when v_score_improved then coalesce(p_damage_taken, 0) else coalesce(v_existing.damage_taken, 0) end;

  insert into public.bsm_high_scores (
    user_id, level_id, level_slug, score, rank, completed, duration_seconds, difficulty,
    drones_eaten, balloons_survived, rainbow_blasts_used, damage_taken, completed_at, updated_at
  )
  values (
    v_user_id, p_level_id, p_level_slug, v_next_score, v_next_rank, true, v_next_duration, v_next_difficulty,
    v_next_drones_eaten, v_next_balloons_survived, v_next_rainbow_blasts_used, v_next_damage_taken,
    coalesce(p_completed_at, now()), now()
  )
  on conflict (user_id, level_id) do update set
    level_slug = excluded.level_slug,
    score = excluded.score,
    rank = excluded.rank,
    completed = true,
    duration_seconds = excluded.duration_seconds,
    difficulty = excluded.difficulty,
    drones_eaten = excluded.drones_eaten,
    balloons_survived = excluded.balloons_survived,
    rainbow_blasts_used = excluded.rainbow_blasts_used,
    damage_taken = excluded.damage_taken,
    completed_at = excluded.completed_at,
    updated_at = now();

  return query select true, v_score_improved, v_time_improved, v_existing.score, v_next_score,
    v_existing.duration_seconds, v_next_duration, p_level_id, v_next_score, v_next_rank,
    v_next_duration, v_next_drones_eaten, v_next_difficulty;
end;
$$;

grant execute on function public.record_bsm_run(
  text, text, integer, text, integer, text, integer, integer, integer, integer, timestamptz
) to authenticated;

commit;
