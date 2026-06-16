-- EOD Arcade challenge coins: 10 daily plays, +1 bonus on new global level high score (no billing).
begin;

create table if not exists public.arcade_challenge_coins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  grant_date date not null,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.arcade_challenge_coins is
  'Daily arcade play allowance (challenge coins). Reset to 10 each UTC day; bonus coins from global leaderboard high scores may exceed 10.';

alter table public.arcade_challenge_coins enable row level security;

create policy "arcade_challenge_coins_select_own"
  on public.arcade_challenge_coins
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "arcade_challenge_coins_update_own"
  on public.arcade_challenge_coins
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public._arcade_daily_max_challenge_coins()
returns integer
language sql
immutable
as $$
  select 10;
$$;

create or replace function public._arcade_ensure_daily_challenge_coins(p_user_id uuid)
returns public.arcade_challenge_coins
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_daily_max integer := public._arcade_daily_max_challenge_coins();
  v_row public.arcade_challenge_coins;
begin
  if p_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  insert into public.arcade_challenge_coins (user_id, grant_date, balance, updated_at)
  values (p_user_id, v_today, v_daily_max, now())
  on conflict (user_id) do nothing;

  select *
  into v_row
  from public.arcade_challenge_coins
  where user_id = p_user_id
  for update;

  if v_row.grant_date is distinct from v_today then
    update public.arcade_challenge_coins
    set
      grant_date = v_today,
      balance = v_daily_max,
      updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public._arcade_grant_challenge_coin(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.arcade_challenge_coins;
begin
  v_row := public._arcade_ensure_daily_challenge_coins(p_user_id);

  update public.arcade_challenge_coins
  set
    balance = v_row.balance + 1,
    updated_at = now()
  where user_id = p_user_id
  returning balance into v_row.balance;

  return v_row.balance;
end;
$$;

create or replace function public.get_arcade_wallet()
returns table (
  balance integer,
  daily_max integer,
  grant_date date
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.arcade_challenge_coins;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  v_row := public._arcade_ensure_daily_challenge_coins(v_user_id);

  return query
  select
    v_row.balance,
    public._arcade_daily_max_challenge_coins(),
    v_row.grant_date;
end;
$$;

grant execute on function public.get_arcade_wallet() to authenticated;

create or replace function public.spend_arcade_challenge_coin(
  p_game_id text,
  p_level_id text
)
returns table (
  balance integer,
  daily_max integer,
  spent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.arcade_challenge_coins;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_game_id is null or btrim(p_game_id) = '' then
    raise exception 'game_id is required';
  end if;

  if p_level_id is null or btrim(p_level_id) = '' then
    raise exception 'level_id is required';
  end if;

  v_row := public._arcade_ensure_daily_challenge_coins(v_user_id);

  if v_row.balance < 1 then
    return query
    select
      v_row.balance,
      public._arcade_daily_max_challenge_coins(),
      false;
    return;
  end if;

  update public.arcade_challenge_coins as acc
  set
    balance = acc.balance - 1,
    updated_at = now()
  where acc.user_id = v_user_id
  returning * into v_row;

  return query
  select
    v_row.balance,
    public._arcade_daily_max_challenge_coins(),
    true;
end;
$$;

grant execute on function public.spend_arcade_challenge_coin(text, text) to authenticated;

create or replace function public.record_render_safe_run(
  p_level_id text,
  p_level_slug text,
  p_score integer,
  p_rank text,
  p_mistakes integer,
  p_duration_seconds integer,
  p_completed_at timestamptz
)
returns table (
  saved boolean,
  is_new_score_best boolean,
  previous_best integer,
  current_best integer,
  coin_granted boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_has_existing boolean := false;
  v_score_improved boolean;
  v_global_best_other integer;
  v_beats_global_high boolean := false;
  v_coin_granted boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_level_id is null or btrim(p_level_id) = '' then
    raise exception 'level_id is required';
  end if;

  if p_score is null or p_score < 0 then
    raise exception 'score must be non-negative';
  end if;

  select *
  into v_existing
  from public.render_safe_high_scores hs
  where hs.user_id = v_user_id
    and hs.level_id = p_level_id
  limit 1;
  v_has_existing := found;

  v_score_improved := not v_has_existing or p_score > v_existing.score;

  if v_score_improved then
    select max(hs.score)
    into v_global_best_other
    from public.render_safe_high_scores hs
    where hs.level_id = p_level_id
      and hs.completed = true
      and hs.user_id <> v_user_id;

    v_beats_global_high := p_score > coalesce(v_global_best_other, -1);
  end if;

  if not v_score_improved then
    return query
    select
      false,
      false,
      v_existing.score,
      v_existing.score,
      false;
    return;
  end if;

  insert into public.render_safe_high_scores (
    user_id,
    level_id,
    level_slug,
    score,
    rank,
    mistakes,
    completed,
    duration_seconds,
    completed_at,
    updated_at
  )
  values (
    v_user_id,
    p_level_id,
    p_level_slug,
    p_score,
    p_rank,
    coalesce(p_mistakes, 0),
    true,
    p_duration_seconds,
    coalesce(p_completed_at, now()),
    now()
  )
  on conflict (user_id, level_id) do update
    set
      level_slug = excluded.level_slug,
      score = excluded.score,
      rank = excluded.rank,
      mistakes = excluded.mistakes,
      completed = true,
      duration_seconds = excluded.duration_seconds,
      completed_at = excluded.completed_at,
      updated_at = now();

  if v_beats_global_high then
    perform public._arcade_grant_challenge_coin(v_user_id);
    v_coin_granted := true;
  end if;

  return query
  select
    true,
    true,
    case when v_has_existing then v_existing.score else null end,
    p_score,
    v_coin_granted;
end;
$$;

grant execute on function public.record_render_safe_run(
  text,
  text,
  integer,
  text,
  integer,
  integer,
  timestamptz
) to authenticated;

-- Postgres cannot change a function's return row type with CREATE OR REPLACE.
drop function if exists public.record_rainbow_cowboy_run(
  text,
  text,
  integer,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  timestamptz
);

-- Award a challenge coin when a run sets a new global high score on the level.
create or replace function public.record_rainbow_cowboy_run(
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
  difficulty text,
  coin_granted boolean
)
language plpgsql
security invoker
set search_path = ''
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
  v_global_best_other integer;
  v_beats_global_high boolean := false;
  v_coin_granted boolean := false;
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

  if p_score is null or p_score < 0 then
    raise exception 'score must be non-negative';
  end if;

  if p_duration_seconds is not null and p_duration_seconds < 0 then
    raise exception 'duration_seconds must be non-negative';
  end if;

  insert into public.rainbow_cowboy_completions (
    user_id,
    level_id,
    difficulty,
    completed_at
  )
  values (
    v_user_id,
    p_level_id,
    p_difficulty,
    coalesce(p_completed_at, now())
  )
  on conflict (user_id, level_id, difficulty) do update
    set completed_at = least(
      public.rainbow_cowboy_completions.completed_at,
      excluded.completed_at
    );

  select *
  into v_existing
  from public.rainbow_cowboy_high_scores hs
  where hs.user_id = v_user_id
    and hs.level_id = p_level_id
  limit 1;
  v_has_existing := found;

  v_score_improved := not v_has_existing or p_score > v_existing.score;
  v_time_improved := not v_has_existing
    or v_existing.duration_seconds is null
    or (
      p_duration_seconds is not null
      and p_duration_seconds < v_existing.duration_seconds
    );

  if not v_score_improved and not v_time_improved then
    return query
    select
      false,
      false,
      false,
      v_existing.score,
      v_existing.score,
      v_existing.duration_seconds,
      v_existing.duration_seconds,
      v_existing.level_id,
      v_existing.score,
      v_existing.rank,
      v_existing.duration_seconds,
      v_existing.drones_eaten,
      v_existing.difficulty,
      false;
    return;
  end if;

  if v_score_improved then
    select max(hs.score)
    into v_global_best_other
    from public.rainbow_cowboy_high_scores hs
    where hs.level_id = p_level_id
      and hs.completed = true
      and hs.user_id <> v_user_id;

    v_beats_global_high := p_score > coalesce(v_global_best_other, -1);
  end if;

  v_next_score := case when v_score_improved then p_score else v_existing.score end;
  v_next_rank := case when v_score_improved then p_rank else v_existing.rank end;
  v_next_duration := case when v_time_improved then p_duration_seconds else v_existing.duration_seconds end;
  v_next_difficulty := case when v_score_improved then p_difficulty else coalesce(v_existing.difficulty, p_difficulty) end;
  v_next_drones_eaten := case when v_score_improved then coalesce(p_drones_eaten, 0) else coalesce(v_existing.drones_eaten, 0) end;
  v_next_balloons_survived := case when v_score_improved then coalesce(p_balloons_survived, 0) else coalesce(v_existing.balloons_survived, 0) end;
  v_next_rainbow_blasts_used := case when v_score_improved then coalesce(p_rainbow_blasts_used, 0) else coalesce(v_existing.rainbow_blasts_used, 0) end;
  v_next_damage_taken := case when v_score_improved then coalesce(p_damage_taken, 0) else coalesce(v_existing.damage_taken, 0) end;

  insert into public.rainbow_cowboy_high_scores (
    user_id,
    level_id,
    level_slug,
    score,
    rank,
    completed,
    duration_seconds,
    difficulty,
    drones_eaten,
    balloons_survived,
    rainbow_blasts_used,
    damage_taken,
    completed_at,
    updated_at
  )
  values (
    v_user_id,
    p_level_id,
    p_level_slug,
    v_next_score,
    v_next_rank,
    true,
    v_next_duration,
    v_next_difficulty,
    v_next_drones_eaten,
    v_next_balloons_survived,
    v_next_rainbow_blasts_used,
    v_next_damage_taken,
    coalesce(p_completed_at, now()),
    now()
  )
  on conflict (user_id, level_id) do update
    set
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

  if v_beats_global_high then
    perform public._arcade_grant_challenge_coin(v_user_id);
    v_coin_granted := true;
  end if;

  return query
  select
    true,
    v_score_improved,
    v_time_improved,
    v_existing.score,
    v_next_score,
    v_existing.duration_seconds,
    v_next_duration,
    p_level_id,
    v_next_score,
    v_next_rank,
    v_next_duration,
    v_next_drones_eaten,
    v_next_difficulty,
    v_coin_granted;
end;
$$;

grant execute on function public.record_rainbow_cowboy_run(
  text,
  text,
  integer,
  text,
  integer,
  text,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) to authenticated;

commit;
