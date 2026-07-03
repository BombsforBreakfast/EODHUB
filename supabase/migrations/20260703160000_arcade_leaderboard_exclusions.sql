-- Exclude designated accounts from public arcade leaderboards and global-high comparisons.
-- Scores may still be saved for personal play/testing; they are omitted from broad leaderboard views.
begin;

create table if not exists public.arcade_leaderboard_exclusions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

comment on table public.arcade_leaderboard_exclusions is
  'Users whose arcade scores are kept for personal play but excluded from public leaderboards and global-high coin grants.';

alter table public.arcade_leaderboard_exclusions enable row level security;

create or replace function public._arcade_user_excluded_from_leaderboard(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.arcade_leaderboard_exclusions e
    where e.user_id = p_user_id
  );
$$;

grant execute on function public._arcade_user_excluded_from_leaderboard(uuid) to authenticated;

-- Reset founder testing scores and add leaderboard exclusion.
do $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = lower('micheal.p.twigg@gmail.com')
  limit 1;

  if v_user_id is null then
    return;
  end if;

  delete from public.rainbow_cowboy_high_scores
  where user_id = v_user_id;

  delete from public.rainbow_cowboy_completions
  where user_id = v_user_id;

  delete from public.render_safe_high_scores
  where user_id = v_user_id;

  insert into public.arcade_leaderboard_exclusions (user_id, reason)
  values (
    v_user_id,
    'Founder testing account — play allowed, scores excluded from public leaderboards'
  )
  on conflict (user_id) do update
    set reason = excluded.reason;
end $$;

drop function if exists public.get_rainbow_cowboy_leaderboard(text, integer);

create function public.get_rainbow_cowboy_leaderboard(
  p_level_id text,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  display_name text,
  photo_url text,
  service text,
  is_employer boolean,
  score integer,
  rank text,
  duration_seconds integer,
  difficulty text,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    hs.user_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
      'Member'
    ) as display_name,
    p.photo_url,
    p.service,
    (p.account_type = 'employer') as is_employer,
    hs.score,
    hs.rank,
    hs.duration_seconds,
    hs.difficulty,
    hs.completed_at
  from public.rainbow_cowboy_high_scores hs
  join public.profiles p on p.user_id = hs.user_id
  where hs.level_id = p_level_id
    and hs.completed = true
    and not public._arcade_user_excluded_from_leaderboard(hs.user_id)
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_rainbow_cowboy_leaderboard(text, integer) to authenticated;

create or replace function public.get_render_safe_leaderboard(
  p_level_id text,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  display_name text,
  photo_url text,
  service text,
  is_employer boolean,
  score integer,
  rank text,
  duration_seconds integer,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    hs.user_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
      'Member'
    ) as display_name,
    p.photo_url,
    p.service,
    (p.account_type = 'employer') as is_employer,
    hs.score,
    hs.rank,
    hs.duration_seconds,
    hs.completed_at
  from public.render_safe_high_scores hs
  join public.profiles p on p.user_id = hs.user_id
  where hs.level_id = p_level_id
    and hs.completed = true
    and not public._arcade_user_excluded_from_leaderboard(hs.user_id)
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_render_safe_leaderboard(text, integer) to authenticated;

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
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_excluded boolean := false;
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

  v_excluded := public._arcade_user_excluded_from_leaderboard(v_user_id);

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

  insert into public.rainbow_cowboy_completions as rc (
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
      rc.completed_at,
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

  if v_score_improved and not v_excluded then
    select max(hs.score)
    into v_global_best_other
    from public.rainbow_cowboy_high_scores hs
    where hs.level_id = p_level_id
      and hs.completed = true
      and hs.user_id <> v_user_id
      and not public._arcade_user_excluded_from_leaderboard(hs.user_id);

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

  insert into public.rainbow_cowboy_high_scores as hs (
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
  v_excluded boolean := false;
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

  v_excluded := public._arcade_user_excluded_from_leaderboard(v_user_id);

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

  if v_score_improved and not v_excluded then
    select max(hs.score)
    into v_global_best_other
    from public.render_safe_high_scores hs
    where hs.level_id = p_level_id
      and hs.completed = true
      and hs.user_id <> v_user_id
      and not public._arcade_user_excluded_from_leaderboard(hs.user_id);

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

notify pgrst, 'reload schema';

commit;
