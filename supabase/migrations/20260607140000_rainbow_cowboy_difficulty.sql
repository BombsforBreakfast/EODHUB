begin;

alter table public.rainbow_cowboy_high_scores
  add column if not exists difficulty text not null default 'easy';

alter table public.rainbow_cowboy_high_scores
  drop constraint if exists rainbow_cowboy_high_scores_difficulty_check;

alter table public.rainbow_cowboy_high_scores
  add constraint rainbow_cowboy_high_scores_difficulty_check
  check (difficulty in ('easy', 'novice', 'hard'));

comment on column public.rainbow_cowboy_high_scores.difficulty is
  'Difficulty mode for the personal-best run (easy, novice, hard).';

-- Return type adds difficulty; CREATE OR REPLACE cannot change OUT columns.
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
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_rainbow_cowboy_leaderboard(text, integer) to authenticated;

comment on function public.get_rainbow_cowboy_leaderboard(text, integer) is
  'Top scores for a Rainbow Cowboy / Unicorn Hero level with profile display fields and difficulty mode.';

commit;
