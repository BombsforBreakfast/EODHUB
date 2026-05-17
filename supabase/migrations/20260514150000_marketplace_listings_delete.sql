-- Allow owners and admins to hard-delete marketplace listings (Lemon Lot).

begin;

grant delete on public.marketplace_listings to authenticated;

drop policy if exists marketplace_listings_delete_owner on public.marketplace_listings;
create policy marketplace_listings_delete_owner
  on public.marketplace_listings
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists marketplace_listings_delete_admin on public.marketplace_listings;
create policy marketplace_listings_delete_admin
  on public.marketplace_listings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false)
    )
  );

commit;
