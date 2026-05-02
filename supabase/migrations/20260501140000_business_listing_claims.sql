-- Ownership claims for approved business/org listings; approved claimant becomes listing manager.

alter table public.business_listings
  add column if not exists managed_by_user_id uuid references auth.users (id) on delete set null;

create index if not exists business_listings_managed_by_user_id_idx
  on public.business_listings (managed_by_user_id)
  where managed_by_user_id is not null;

create table if not exists public.business_listing_claims (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.business_listings (id) on delete cascade,
  claimant_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);

create unique index if not exists business_listing_claims_one_pending_per_user_listing
  on public.business_listing_claims (listing_id, claimant_user_id)
  where status = 'pending';

create index if not exists business_listing_claims_pending_created_idx
  on public.business_listing_claims (created_at desc)
  where status = 'pending';

comment on table public.business_listing_claims is
  'Users request ownership of an approved business/org listing; admins approve or reject.';
comment on column public.business_listings.managed_by_user_id is
  'Non-admin user granted edit/delete rights for this listing after an approved claim.';

create or replace function public.trg_business_listing_claims_validate_ins()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  rec public.business_listings%rowtype;
begin
  if new.status is distinct from 'pending' then
    raise exception 'Claims must be submitted as pending';
  end if;

  select * into rec from public.business_listings where id = new.listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  if coalesce(rec.is_approved, false) is not true then
    raise exception 'Only approved listings can be claimed';
  end if;
  if rec.listing_type is null or rec.listing_type not in ('business', 'organization') then
    raise exception 'This listing type cannot be claimed';
  end if;
  if rec.managed_by_user_id is not null then
    raise exception 'This listing already has a manager';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_business_listing_claims_validate_ins on public.business_listing_claims;
create trigger trg_business_listing_claims_validate_ins
  before insert on public.business_listing_claims
  for each row execute function public.trg_business_listing_claims_validate_ins();

alter table public.business_listing_claims enable row level security;

create policy business_listing_claims_select_own_or_admin
  on public.business_listing_claims
  for select
  using (
    claimant_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

create policy business_listing_claims_insert_own_pending
  on public.business_listing_claims
  for insert
  with check (
    claimant_user_id = auth.uid()
    and status = 'pending'
  );

-- Mutations are performed via security definer RPCs (below); no direct update/delete for clients.

create or replace function public.approve_business_listing_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_id uuid;
  v_claimant uuid;
  v_updated int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;

  select listing_id, claimant_user_id
  into v_listing_id, v_claimant
  from public.business_listing_claims
  where id = p_claim_id and status = 'pending'
  for update;

  if v_listing_id is null then
    raise exception 'Claim not found or not pending';
  end if;

  update public.business_listing_claims
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where listing_id = v_listing_id and status = 'pending' and id <> p_claim_id;

  update public.business_listing_claims
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_claim_id and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Could not approve claim';
  end if;

  update public.business_listings
  set managed_by_user_id = v_claimant
  where id = v_listing_id;
end;
$$;

create or replace function public.reject_business_listing_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;

  update public.business_listing_claims
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_claim_id and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Claim not found or not pending';
  end if;
end;
$$;

grant execute on function public.approve_business_listing_claim(uuid) to authenticated;
grant execute on function public.reject_business_listing_claim(uuid) to authenticated;
