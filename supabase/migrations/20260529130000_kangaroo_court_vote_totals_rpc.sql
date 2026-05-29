-- Anonymous per-option vote totals for Kangaroo Court UI.
-- kangaroo_court_votes SELECT is own-row-only (RLS audit); clients must not aggregate raw rows.

begin;

create or replace function public.kangaroo_court_vote_totals(p_court_ids uuid[])
returns table (court_id uuid, option_id uuid, vote_count int)
language sql
stable
security definer
set search_path = public
as $$
  select v.court_id, v.option_id, count(*)::int as vote_count
  from public.kangaroo_court_votes v
  where v.court_id = any(p_court_ids)
  group by v.court_id, v.option_id;
$$;

revoke all on function public.kangaroo_court_vote_totals(uuid[]) from public;
grant execute on function public.kangaroo_court_vote_totals(uuid[]) to authenticated;

commit;
