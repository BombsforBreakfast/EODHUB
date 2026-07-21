-- Daily arcade challenge-coin refill: top up only balances below daily max,
-- preserve surplus (>= max) across UTC day rollover, and expose a batch RPC
-- for the midnight cron to notify players who actually reupped.
begin;

comment on table public.arcade_challenge_coins is
  'Daily arcade play allowance (challenge coins). Balances below 10 refill each UTC day; surplus above 10 from global high-score bonuses is preserved across the day rollover.';

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
      -- Only refill when below the daily max; keep surplus from bonus coins.
      balance = case
        when v_row.balance < v_daily_max then v_daily_max
        else v_row.balance
      end,
      updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- Applies UTC day rollover for all wallets. Returns only users who were
-- topped up from below the daily max (candidates for refill notifications).
create or replace function public.arcade_apply_daily_challenge_coin_refills()
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_daily_max integer := public._arcade_daily_max_challenge_coins();
begin
  -- Preserve surplus: roll the grant date without changing balance.
  update public.arcade_challenge_coins as acc
  set
    grant_date = v_today,
    updated_at = now()
  where acc.grant_date is distinct from v_today
    and acc.balance >= v_daily_max
    and not public._arcade_has_unlimited_challenge_coins(acc.user_id);

  -- Refill players who spent coins yesterday (or earlier) and return them.
  return query
  update public.arcade_challenge_coins as acc
  set
    grant_date = v_today,
    balance = v_daily_max,
    updated_at = now()
  where acc.grant_date is distinct from v_today
    and acc.balance < v_daily_max
    and not public._arcade_has_unlimited_challenge_coins(acc.user_id)
  returning acc.user_id;
end;
$$;

revoke all on function public.arcade_apply_daily_challenge_coin_refills() from public;
revoke all on function public.arcade_apply_daily_challenge_coin_refills() from anon;
revoke all on function public.arcade_apply_daily_challenge_coin_refills() from authenticated;
grant execute on function public.arcade_apply_daily_challenge_coin_refills() to service_role;

commit;
