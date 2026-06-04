begin;

-- Business / Organization Pages are page identities owned by existing users.
-- They are intentionally distinct from employer accounts and do not grant
-- employer permissions.

create table if not exists public.business_organization_pages (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  business_auth_user_id uuid references auth.users (id) on delete set null,
  business_name text not null,
  description text not null,
  business_email text not null,
  linked_account_email text not null,
  logo_url text not null,
  website_url text,
  location text,
  address text,
  phone text,
  owner_info text,
  verification_status text not null default 'approved'
    check (verification_status in ('pending', 'approved', 'denied', 'needs_revalidation', 'deactivated')),
  claimed_business_listing_id uuid references public.business_listings (id) on delete set null,
  is_active boolean not null default true,
  subscription_status text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_paused_at timestamptz,
  billing_disabled_at timestamptz,
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_org_pages_business_name_len check (
    char_length(trim(business_name)) >= 1 and char_length(business_name) <= 160
  ),
  constraint business_org_pages_description_len check (
    char_length(trim(description)) >= 1 and char_length(description) <= 4000
  ),
  constraint business_org_pages_logo_url_len check (
    char_length(trim(logo_url)) >= 1 and char_length(logo_url) <= 2000
  ),
  constraint business_org_pages_business_email_format check (
    business_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  constraint business_org_pages_linked_email_format check (
    linked_account_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  constraint business_org_pages_website_url_len check (
    website_url is null or char_length(website_url) <= 2000
  )
);

create index if not exists business_org_pages_owner_idx
  on public.business_organization_pages (owner_user_id, created_at desc);

-- Rerun/partial-run safety: CREATE TABLE IF NOT EXISTS does not add columns
-- when the table already exists from an earlier local migration attempt.
alter table public.business_organization_pages
  add column if not exists business_auth_user_id uuid
    references auth.users (id) on delete set null;

alter table public.business_organization_pages
  alter column verification_status set default 'approved',
  alter column is_active set default true,
  alter column subscription_status drop not null,
  alter column subscription_status drop default;

create unique index if not exists business_org_pages_business_auth_user_id_idx
  on public.business_organization_pages (business_auth_user_id)
  where business_auth_user_id is not null;

-- Business page auth accounts are created behind verified-owner gates, so
-- they should not enter the normal personal-account email/admin queue.
update public.profiles
set
  email_verified = true,
  admin_verified = true,
  verification_status = 'verified',
  must_complete_onboarding = false
where account_type = 'business_org'
  and (
    email_verified is distinct from true
    or admin_verified is distinct from true
    or verification_status is distinct from 'verified'
    or must_complete_onboarding is distinct from false
  );

-- Business pages are created only after a verified owner authenticates, so
-- they should be active immediately. Billing status remains null until Stripe
-- is wired into the business-page subscription flow.
update public.business_organization_pages
set
  verification_status = 'approved',
  is_active = true,
  subscription_status = null
where (
    verification_status = 'pending'
    or is_active is distinct from true
    or subscription_status = 'not_started'
  );

create index if not exists business_org_pages_review_idx
  on public.business_organization_pages (created_at desc)
  where verification_status = 'pending';

create index if not exists business_org_pages_active_idx
  on public.business_organization_pages (business_name)
  where is_active = true and verification_status = 'approved';

create unique index if not exists business_org_pages_stripe_subscription_id_idx
  on public.business_organization_pages (stripe_subscription_id)
  where stripe_subscription_id is not null;

create or replace function public.touch_business_organization_pages_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_org_pages_touch_updated_at
  on public.business_organization_pages;
create trigger trg_business_org_pages_touch_updated_at
  before update on public.business_organization_pages
  for each row execute function public.touch_business_organization_pages_updated_at();

create or replace function public.business_org_linked_email_matches_owner(
  p_owner_user_id uuid,
  p_linked_email text
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = p_owner_user_id
      and lower(p.email) = lower(trim(p_linked_email))
  );
$$;

revoke all on function public.business_org_linked_email_matches_owner(uuid, text) from public;
grant execute on function public.business_org_linked_email_matches_owner(uuid, text) to authenticated;

create or replace function public.trg_business_org_pages_validate_owner_email()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.owner_user_id is distinct from auth.uid()
      and new.business_auth_user_id is distinct from auth.uid() then
      raise exception 'Business organization pages must be owned by the authenticated user';
    end if;

    if not public.business_org_linked_email_matches_owner(new.owner_user_id, new.linked_account_email) then
      raise exception 'The linked EOD-HUB account email must match your authenticated EOD-HUB account email.';
    end if;
  end if;

  new.business_email := lower(trim(new.business_email));
  new.linked_account_email := lower(trim(new.linked_account_email));
  new.business_name := trim(new.business_name);
  new.description := trim(new.description);
  new.logo_url := trim(new.logo_url);
  new.website_url := nullif(trim(coalesce(new.website_url, '')), '');
  return new;
end;
$$;

drop trigger if exists trg_business_org_pages_validate_owner_email
  on public.business_organization_pages;
create trigger trg_business_org_pages_validate_owner_email
  before insert or update of owner_user_id, linked_account_email, business_email, business_name, description, logo_url, website_url
  on public.business_organization_pages
  for each row execute function public.trg_business_org_pages_validate_owner_email();

alter table public.business_organization_pages enable row level security;

drop policy if exists business_org_pages_public_select_approved
  on public.business_organization_pages;
create policy business_org_pages_public_select_approved
  on public.business_organization_pages
  for select
  to anon
  using (is_active = true and verification_status = 'approved');

drop policy if exists business_org_pages_select_visible_or_owner_or_admin
  on public.business_organization_pages;
create policy business_org_pages_select_visible_or_owner_or_admin
  on public.business_organization_pages
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or business_auth_user_id = auth.uid()
    or (is_active = true and verification_status = 'approved')
    or public.is_current_user_admin()
  );

drop policy if exists business_org_pages_insert_own
  on public.business_organization_pages;
create policy business_org_pages_insert_own
  on public.business_organization_pages
  for insert
  to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.business_org_linked_email_matches_owner(owner_user_id, linked_account_email)
  );

drop policy if exists business_org_pages_update_owner_draft
  on public.business_organization_pages;
create policy business_org_pages_update_owner_draft
  on public.business_organization_pages
  for update
  to authenticated
  using (owner_user_id = auth.uid() or business_auth_user_id = auth.uid())
  with check (
    (owner_user_id = auth.uid() or business_auth_user_id = auth.uid())
    and public.business_org_linked_email_matches_owner(owner_user_id, linked_account_email)
  );

drop policy if exists business_org_pages_admin_all
  on public.business_organization_pages;
create policy business_org_pages_admin_all
  on public.business_organization_pages
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

alter table public.business_listings
  add column if not exists claimed_business_org_page_id uuid
    references public.business_organization_pages (id) on delete set null;

create index if not exists business_listings_claimed_business_org_page_id_idx
  on public.business_listings (claimed_business_org_page_id)
  where claimed_business_org_page_id is not null;

create table if not exists public.business_org_onboarding_sessions (
  token text primary key,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  linked_account_email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists business_org_onboarding_sessions_owner_idx
  on public.business_org_onboarding_sessions (owner_user_id, created_at desc);

create index if not exists business_org_onboarding_sessions_expires_idx
  on public.business_org_onboarding_sessions (expires_at)
  where consumed_at is null;

alter table public.business_org_onboarding_sessions enable row level security;

create table if not exists public.business_org_claim_requests (
  id uuid primary key default gen_random_uuid(),
  business_listing_id uuid not null references public.business_listings (id) on delete cascade,
  business_org_page_id uuid not null references public.business_organization_pages (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'needs_info')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create unique index if not exists business_org_claim_requests_one_pending
  on public.business_org_claim_requests (business_listing_id, business_org_page_id)
  where status = 'pending';

create index if not exists business_org_claim_requests_pending_idx
  on public.business_org_claim_requests (created_at desc)
  where status = 'pending';

alter table public.business_org_claim_requests enable row level security;

drop policy if exists business_org_claim_requests_select_owner_or_admin
  on public.business_org_claim_requests;
create policy business_org_claim_requests_select_owner_or_admin
  on public.business_org_claim_requests
  for select
  to authenticated
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
    or public.is_current_user_admin()
  );

drop policy if exists business_org_claim_requests_insert_owner_pending
  on public.business_org_claim_requests;
create policy business_org_claim_requests_insert_owner_pending
  on public.business_org_claim_requests
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
        and p.is_active = true
        and p.verification_status = 'approved'
    )
  );

drop policy if exists business_org_claim_requests_admin_all
  on public.business_org_claim_requests;
create policy business_org_claim_requests_admin_all
  on public.business_org_claim_requests
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create or replace function public.trg_business_org_claim_requests_validate()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_listing public.business_listings%rowtype;
begin
  if new.status is distinct from 'pending' then
    raise exception 'Claims must be submitted as pending';
  end if;

  select * into v_listing
  from public.business_listings
  where id = new.business_listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;
  if coalesce(v_listing.is_approved, false) is not true then
    raise exception 'Only approved listings can be claimed';
  end if;
  if v_listing.listing_type is null or v_listing.listing_type not in ('business', 'organization') then
    raise exception 'This listing type cannot be claimed';
  end if;
  if v_listing.claimed_business_org_page_id is not null then
    raise exception 'This listing is already linked to a business page';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_business_org_claim_requests_validate
  on public.business_org_claim_requests;
create trigger trg_business_org_claim_requests_validate
  before insert on public.business_org_claim_requests
  for each row execute function public.trg_business_org_claim_requests_validate();

create table if not exists public.business_org_relationship_suggestions (
  id uuid primary key default gen_random_uuid(),
  business_org_page_id uuid not null references public.business_organization_pages (id) on delete cascade,
  business_listing_id uuid not null references public.business_listings (id) on delete cascade,
  signal_type text not null check (signal_type in ('email_match', 'domain_match', 'existing_manager')),
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'dismissed', 'claim_submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_org_page_id, business_listing_id, signal_type)
);

alter table public.business_org_relationship_suggestions enable row level security;

drop policy if exists business_org_relationship_suggestions_select_owner_or_admin
  on public.business_org_relationship_suggestions;
create policy business_org_relationship_suggestions_select_owner_or_admin
  on public.business_org_relationship_suggestions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
    or public.is_current_user_admin()
  );

drop policy if exists business_org_relationship_suggestions_update_owner_or_admin
  on public.business_org_relationship_suggestions;
create policy business_org_relationship_suggestions_update_owner_or_admin
  on public.business_org_relationship_suggestions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
    or public.is_current_user_admin()
  )
  with check (
    exists (
      select 1 from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
    or public.is_current_user_admin()
  );

drop policy if exists business_org_relationship_suggestions_admin_all
  on public.business_org_relationship_suggestions;
create policy business_org_relationship_suggestions_admin_all
  on public.business_org_relationship_suggestions
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

create table if not exists public.business_org_products (
  id uuid primary key default gen_random_uuid(),
  business_org_page_id uuid not null references public.business_organization_pages (id) on delete cascade,
  name text not null,
  description text,
  price_text text,
  image_url text not null,
  product_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_org_products_name_len check (
    char_length(trim(name)) >= 1 and char_length(name) <= 160
  ),
  constraint business_org_products_description_len check (
    description is null or char_length(description) <= 1000
  ),
  constraint business_org_products_price_len check (
    price_text is null or char_length(price_text) <= 80
  ),
  constraint business_org_products_image_url_len check (
    char_length(trim(image_url)) >= 1 and char_length(image_url) <= 2000
  ),
  constraint business_org_products_product_url_len check (
    char_length(trim(product_url)) >= 1 and char_length(product_url) <= 2000
  )
);

create index if not exists business_org_products_page_idx
  on public.business_org_products (business_org_page_id, sort_order, created_at desc);

create or replace function public.touch_business_org_products_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_org_products_touch_updated_at
  on public.business_org_products;
create trigger trg_business_org_products_touch_updated_at
  before update on public.business_org_products
  for each row execute function public.touch_business_org_products_updated_at();

alter table public.business_org_products enable row level security;

drop policy if exists business_org_products_public_select_active
  on public.business_org_products;
create policy business_org_products_public_select_active
  on public.business_org_products
  for select
  to anon
  using (
    is_active = true
    and exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and p.is_active = true
        and p.verification_status = 'approved'
    )
  );

drop policy if exists business_org_products_select_visible_or_owner_or_admin
  on public.business_org_products;
create policy business_org_products_select_visible_or_owner_or_admin
  on public.business_org_products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and (
          p.owner_user_id = auth.uid()
          or p.business_auth_user_id = auth.uid()
          or (p.is_active = true and p.verification_status = 'approved')
          or public.is_current_user_admin()
        )
    )
  );

drop policy if exists business_org_products_insert_owner_or_business
  on public.business_org_products;
create policy business_org_products_insert_owner_or_business
  on public.business_org_products
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists business_org_products_update_owner_or_business
  on public.business_org_products;
create policy business_org_products_update_owner_or_business
  on public.business_org_products
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists business_org_products_delete_owner_or_business
  on public.business_org_products;
create policy business_org_products_delete_owner_or_business
  on public.business_org_products
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.business_organization_pages p
      where p.id = business_org_page_id
        and (p.owner_user_id = auth.uid() or p.business_auth_user_id = auth.uid())
    )
  );

drop policy if exists business_org_products_admin_all
  on public.business_org_products;
create policy business_org_products_admin_all
  on public.business_org_products
  for all
  to authenticated
  using (public.is_current_user_admin())
  with check (public.is_current_user_admin());

commit;
