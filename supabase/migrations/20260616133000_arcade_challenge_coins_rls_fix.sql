-- Fix arcade coin spend: table had RLS enabled but no policies, so spend_arcade_challenge_coin
-- could not UPDATE the caller's wallet row as security invoker.
begin;

drop policy if exists "arcade_challenge_coins_select_own" on public.arcade_challenge_coins;
drop policy if exists "arcade_challenge_coins_update_own" on public.arcade_challenge_coins;

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

notify pgrst, 'reload schema';

commit;
