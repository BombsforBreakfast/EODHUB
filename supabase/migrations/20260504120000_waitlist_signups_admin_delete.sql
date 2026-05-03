-- Allow site admins to delete waitlist rows (testing / cleanup).

begin;

drop policy if exists waitlist_signups_delete_admin on public.waitlist_signups;
create policy waitlist_signups_delete_admin
  on public.waitlist_signups
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

commit;
