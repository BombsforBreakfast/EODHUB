begin;

-- QA override: allow designated admins to use employer dashboard write actions.
-- Row ownership remains private because auth.uid() must still equal employer_id.

create or replace function public.is_employer_or_admin_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = uid
      and (
        p.account_type = 'employer'
        or coalesce(p.is_admin, false)
      )
  );
$$;

revoke all on function public.is_employer_or_admin_user(uuid) from public;
grant execute on function public.is_employer_or_admin_user(uuid) to authenticated;

drop policy if exists "employer_user_actions_insert_own"
  on public.employer_user_actions;
create policy "employer_user_actions_insert_own"
  on public.employer_user_actions
  for insert
  to authenticated
  with check (
    auth.uid() = employer_id
    and public.is_employer_or_admin_user(auth.uid())
  );

drop policy if exists "employer_user_actions_update_own"
  on public.employer_user_actions;
create policy "employer_user_actions_update_own"
  on public.employer_user_actions
  for update
  to authenticated
  using (auth.uid() = employer_id)
  with check (
    auth.uid() = employer_id
    and public.is_employer_or_admin_user(auth.uid())
  );

commit;
