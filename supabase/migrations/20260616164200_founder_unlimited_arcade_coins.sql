-- Founder/staff testing accounts should not spend down arcade challenge coins.
-- Use profiles.is_pure_admin because the database cannot read the app's FOUNDER_USER_ID env var.
begin;

create or replace function public._arcade_unlimited_challenge_coins_balance()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 999999;
$$;

grant execute on function public._arcade_unlimited_challenge_coins_balance() to authenticated;

create or replace function public._arcade_has_unlimited_challenge_coins(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and coalesce(p.is_pure_admin, false) = true
  );
$$;

grant execute on function public._arcade_has_unlimited_challenge_coins(uuid) to authenticated;

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
  v_today date := (timezone('utc', now()))::date;
  v_row public.arcade_challenge_coins;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if public._arcade_has_unlimited_challenge_coins(v_user_id) then
    return query
    select
      public._arcade_unlimited_challenge_coins_balance(),
      public._arcade_unlimited_challenge_coins_balance(),
      v_today;
    return;
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

  if public._arcade_has_unlimited_challenge_coins(v_user_id) then
    return query
    select
      public._arcade_unlimited_challenge_coins_balance(),
      public._arcade_unlimited_challenge_coins_balance(),
      true;
    return;
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

notify pgrst, 'reload schema';

commit;
