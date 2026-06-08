begin;

-- Public read-only leaderboards for arcade games (personal-best rows per user per level).
create or replace function public.get_rainbow_cowboy_leaderboard(
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
  from public.rainbow_cowboy_high_scores hs
  join public.profiles p on p.user_id = hs.user_id
  where hs.level_id = p_level_id
    and hs.completed = true
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

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
  order by hs.score desc, hs.duration_seconds asc nulls last, hs.completed_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_rainbow_cowboy_leaderboard(text, integer) to authenticated;
grant execute on function public.get_render_safe_leaderboard(text, integer) to authenticated;

comment on function public.get_rainbow_cowboy_leaderboard(text, integer) is
  'Top scores for a Rainbow Cowboy / Unicorn Hero level with profile display fields.';

comment on function public.get_render_safe_leaderboard(text, integer) is
  'Top scores for a Render Safe level with profile display fields.';

commit;
