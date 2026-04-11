-- Voting failed on hosted Supabase: RLS allowed only SELECT on kangaroo_court_votes, so INSERT
-- from vote_kangaroo_court was denied. Also avoid relying on UPDATE kangaroo_courts from the RPC
-- (RLS can block updates). Bump total_votes in a SECURITY DEFINER trigger after insert.

begin;

drop policy if exists "kangaroo_court_votes_insert_own_user" on public.kangaroo_court_votes;
create policy "kangaroo_court_votes_insert_own_user"
  on public.kangaroo_court_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create or replace function public._kc_bump_court_total_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.kangaroo_courts
  set total_votes = coalesce(total_votes, 0) + 1
  where id = new.court_id;
  return new;
end;
$$;

drop trigger if exists kangaroo_court_votes_after_insert_bump on public.kangaroo_court_votes;
create trigger kangaroo_court_votes_after_insert_bump
  after insert on public.kangaroo_court_votes
  for each row
  execute function public._kc_bump_court_total_votes();

revoke all on function public._kc_bump_court_total_votes() from public;

-- Remove manual total_votes update (trigger handles it). Keeps vote count correct without UPDATE RLS on courts.
create or replace function public.vote_kangaroo_court(p_court_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_court public.kangaroo_courts%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_court from public.kangaroo_courts where id = p_court_id for update;
  if not found then
    raise exception 'Court not found';
  end if;

  if v_court.status <> 'active' then
    raise exception 'Voting is closed';
  end if;

  if v_court.expires_at <= now() then
    raise exception 'Voting is closed';
  end if;

  if not exists (
    select 1 from public.kangaroo_court_options o
    where o.id = p_option_id and o.court_id = p_court_id
  ) then
    raise exception 'Invalid option';
  end if;

  insert into public.kangaroo_court_votes (court_id, option_id, user_id)
  values (p_court_id, p_option_id, v_uid);
exception
  when unique_violation then
    raise exception 'Already voted';
end;
$$;

commit;
