begin;

create policy "rainbow_cowboy_completions_update_own"
  on public.rainbow_cowboy_completions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists rainbow_cowboy_high_scores_leaderboard_idx
  on public.rainbow_cowboy_high_scores (
    level_id,
    score desc,
    duration_seconds asc nulls last,
    completed_at asc
  )
  where completed = true;

create index if not exists render_safe_high_scores_leaderboard_idx
  on public.render_safe_high_scores (
    level_id,
    score desc,
    duration_seconds asc nulls last,
    completed_at asc
  )
  where completed = true;

create or replace function public.get_render_safe_personal_bests()
returns table (
  level_id text,
  score integer,
  rank text,
  mistakes integer,
  duration_seconds integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    hs.level_id,
    hs.score,
    hs.rank,
    hs.mistakes,
    hs.duration_seconds
  from public.render_safe_high_scores hs
  where hs.user_id = auth.uid()
    and hs.completed = true;
$$;

grant execute on function public.get_render_safe_personal_bests() to authenticated;

comment on function public.get_render_safe_personal_bests() is
  'Current user Render Safe personal best rows in one bounded read for arcade page load.';

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
  difficulty text
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
        v_existing.difficulty;
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
      v_next_difficulty;
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

comment on function public.record_rainbow_cowboy_run(
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
) is
  'Idempotently records a completed Unicorn Hero run and personal best in one bounded call.';

commit;
