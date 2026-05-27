-- Restrict business listing mutations to admins and approved listing managers.
-- Keep derived like_count in sync from business_likes instead of client writes.

create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_admin, false)
  );
$$;

create or replace function public.trg_business_listings_guard_client_updates()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_is_manager boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if public.is_current_user_admin() then
    return new;
  end if;

  v_is_manager := auth.uid() is not null and old.managed_by_user_id = auth.uid();

  if v_is_manager then
    if new.id is distinct from old.id
      or new.created_at is distinct from old.created_at
      or new.owner_user_id is distinct from old.owner_user_id
      or new.is_approved is distinct from old.is_approved
      or new.is_featured is distinct from old.is_featured
      or new.like_count is distinct from old.like_count
      or new.managed_by_user_id is distinct from old.managed_by_user_id
    then
      raise exception 'Listing managers can only update editable listing fields';
    end if;

    return new;
  end if;

  raise exception 'Only admins or approved listing managers can update business listings';
end;
$$;

create or replace function app_private.sync_business_listing_like_count()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_business_id uuid;
begin
  v_business_id := case
    when tg_op = 'DELETE' then old.business_id
    else new.business_id
  end;

  update public.business_listings b
  set like_count = (
    select count(*)::int
    from public.business_likes bl
    where bl.business_id = v_business_id
  )
  where b.id = v_business_id;

  return null;
end;
$$;

drop trigger if exists trg_business_listings_guard_client_updates on public.business_listings;
create trigger trg_business_listings_guard_client_updates
  before update on public.business_listings
  for each row execute function public.trg_business_listings_guard_client_updates();

drop trigger if exists trg_sync_business_listing_like_count on public.business_likes;
create trigger trg_sync_business_listing_like_count
  after insert or delete on public.business_likes
  for each row execute function app_private.sync_business_listing_like_count();

drop policy if exists "Admins can delete business listings" on public.business_listings;
drop policy if exists "Admins can update business listings" on public.business_listings;
drop policy if exists "Approved managers can update business listings" on public.business_listings;
drop policy if exists "Authenticated users can update business listing like counts" on public.business_listings;
drop policy if exists "Approved managers can delete business listings" on public.business_listings;

create policy "Admins can update business listings"
  on public.business_listings
  for update
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create policy "Approved managers can update business listings"
  on public.business_listings
  for update
  using (auth.uid() is not null and managed_by_user_id = auth.uid() and is_approved = true)
  with check (auth.uid() is not null and managed_by_user_id = auth.uid() and is_approved = true);

create policy "Admins can delete business listings"
  on public.business_listings
  for delete
  using (public.is_current_user_admin());

create policy "Approved managers can delete business listings"
  on public.business_listings
  for delete
  using (auth.uid() is not null and managed_by_user_id = auth.uid() and is_approved = true);

grant execute on function public.is_current_user_admin() to authenticated;
