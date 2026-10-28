-- Dedicated API-only Auth role: rental sign-in is not Hub membership.
-- Portal data is accessed only through authenticated, ownership-checked server APIs.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'eod_rental') then
    create role eod_rental nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end $$;
-- DO NOT grant this role to authenticator or authenticated. PostgREST must
-- reject SET ROLE before rental JWTs can reach tables or legacy RPCs.
-- GoTrue Auth and our ownership-checked server portal APIs still validate them.
-- Existing schema grants, member policies, and Auth signup triggers stay intact.
do $$ begin
  if pg_has_role('authenticator','eod_rental','MEMBER') or pg_has_role('eod_rental','authenticated','MEMBER') then
    raise exception 'Rental API-only role must not be switchable by member API roles';
  end if;
end $$;

create table public.rental_providers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 120),
  phone text not null check (length(phone) between 7 and 40),
  email text not null unique,
  company text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  review_note text,
  email_verified_at timestamptz,
  commitment_version text not null,
  commitment_at timestamptz not null default now(),
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index rental_providers_review on public.rental_providers(status, created_at);

create table public.rental_properties (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.rental_providers(user_id),
  draft jsonb not null default '{}'::jsonb,
  submitted jsonb,
  published jsonb,
  revision integer not null default 1,
  submission_id uuid,
  review_status text not null default 'draft' check (review_status in ('draft','pending','changes_requested','approved','rejected')),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  status text not null default 'available-now' check (status in ('available-now','pending','unavailable')),
  available_date date,
  plan text not null default 'monthly' check (plan in ('monthly','annual')),
  auto_renew boolean not null default false,
  campaign_requested boolean not null default false,
  payment_method_id text,
  setup_order_id uuid,
  stripe_subscription_id text unique,
  billing_submission_id uuid,
  payment_status text not null default 'unpaid',
  payment_url text,
  paid_until timestamptz,
  grace_until timestamptz,
  hidden boolean not null default false,
  commitment_version text,
  commitment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rental_properties_provider on public.rental_properties(provider_id, created_at desc);
create index rental_properties_review on public.rental_properties(review_status, created_at);
create unique index rental_properties_one_address_per_provider on public.rental_properties
  (provider_id,lower(trim(draft->>'address')),lower(trim(draft->>'city')),trim(draft->>'zip'))
  where length(trim(draft->>'address'))>0;
create index rental_properties_public on public.rental_properties(paid_until) where published is not null and not hidden;

create table public.rental_orders (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.rental_providers(user_id),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 50),
  status text not null default 'setup_pending' check (status in ('setup_pending','submitted','canceled')),
  stripe_session_id text unique,
  payment_method_id text,
  consent_version text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index rental_orders_provider on public.rental_orders(provider_id, created_at desc);

create table public.rental_campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.rental_properties(id),
  provider_id uuid not null references public.rental_providers(user_id),
  submission_id uuid not null unique,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','queued','live','report_due','completed','canceled')),
  paid boolean not null default false,
  flyer_path text,
  facebook_url text not null default '',
  instagram_url text not null default '',
  story_notes text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  report text not null default '',
  report_path text,
  metrics jsonb not null default '{}'::jsonb,
  report_alerted_at timestamptz,
  created_at timestamptz not null default now()
);
create index rental_campaigns_provider on public.rental_campaigns(provider_id, created_at desc);
create index rental_campaigns_property on public.rental_campaigns(property_id);
create index rental_campaigns_due on public.rental_campaigns(ends_at) where status = 'live';

create table public.rental_property_metrics (
  property_id uuid not null references public.rental_properties(id),
  day date not null default current_date,
  views integer not null default 0,
  contacts integer not null default 0,
  primary key(property_id, day)
);
create table public.rental_rate_limits (key text primary key, hits integer not null, expires_at timestamptz not null);

do $$ declare t text; begin
  foreach t in array array['rental_providers','rental_properties','rental_orders','rental_campaigns','rental_property_metrics','rental_rate_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, eod_rental',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

-- The existing Auth signup trigger is untouched. Its automatic profile insert
-- becomes a provider insert only for a server-provisioned rental identity.
-- Ordinary member inserts/updates return NEW exactly as before.
create function public.guard_rental_member_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u auth.users;
begin
  select * into u from auth.users where id=new.user_id;
  if u.role='eod_rental' or u.raw_app_meta_data->>'account_type'='rental_provider' then
    if u.role<>'eod_rental' or u.raw_app_meta_data->>'account_type' is distinct from 'rental_provider' then
      raise exception 'Rental accounts require server-provisioned scope' using errcode='42501';
    end if;
    if tg_op='INSERT' then
      insert into public.rental_providers(user_id,full_name,phone,email,company,commitment_version)
      values(u.id,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'phone',lower(u.email),
        coalesce(u.raw_user_meta_data->>'company',''),'2026-10-27-v1') on conflict(user_id) do nothing;
      return null;
    end if;
    raise exception 'Rental accounts cannot have Hub member profiles' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_rental_member_profile() from public,anon,authenticated,eod_rental;
create trigger prevent_rental_hub_profile before insert or update on public.profiles
for each row execute function public.guard_rental_member_profile();

create function public.rental_consume_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql set search_path='' as $$ declare n integer; begin
  insert into public.rental_rate_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set hits=case when rental_rate_limits.expires_at<now() then 1 else rental_rate_limits.hits+1 end,
    expires_at=case when rental_rate_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else rental_rate_limits.expires_at end
  returning hits into n;
  return n<=p_limit;
end $$;

-- Checkout completion atomically freezes the reviewed version. Retried webhooks
-- cannot resubmit an order or change what the provider authorized.
create function public.rental_submit_order(p_id uuid,p_payment_method text) returns integer
language plpgsql set search_path='' as $$
declare o public.rental_orders; item jsonb; n integer:=0; current_row public.rental_properties;
begin
  select * into o from public.rental_orders where id=p_id for update;
  if not found then raise exception 'Unknown rental order'; end if;
  if o.status='submitted' then return 0; end if;
  if o.status<>'setup_pending' then raise exception 'Order is canceled'; end if;
  if not exists(select 1 from public.rental_providers where user_id=o.provider_id and status='approved' and email_verified_at is not null) then raise exception 'Provider is not approved'; end if;
  for item in select * from jsonb_array_elements(o.items) loop
    select * into current_row from public.rental_properties where id=(item->>'id')::uuid and provider_id=o.provider_id for update;
    if not found or current_row.setup_order_id is distinct from o.id or current_row.revision<>(item->>'revision')::integer then raise exception 'Property changed during checkout'; end if;
    update public.rental_properties set submitted=item->'payload',submission_id=(item->>'submissionId')::uuid,
      plan=item->>'plan',auto_renew=(item->>'autoRenew')::boolean,campaign_requested=(item->>'campaign')::boolean,
      review_status='pending',review_note=null,payment_method_id=p_payment_method,setup_order_id=null,
      commitment_version='2026-10-27-v1',commitment_at=now(),updated_at=now()
    where id=current_row.id;
    n:=n+1;
  end loop;
  update public.rental_orders set status='submitted',payment_method_id=p_payment_method where id=o.id;
  return n;
end $$;

create function public.rental_record_metric(p_id uuid,p_kind text) returns void
language sql set search_path='' as $$
  insert into public.rental_property_metrics(property_id,day,views,contacts)
  select id,current_date,case when p_kind='view' then 1 else 0 end,case when p_kind='contact' then 1 else 0 end
  from public.rental_properties p where p.id=p_id and p.published is not null and not p.hidden
  and (p.paid_until>now() or (p.payment_status='past_due' and p.grace_until>now()))
  and exists(select 1 from public.rental_providers r where r.user_id=p.provider_id and r.status='approved')
  on conflict(property_id,day) do update set views=rental_property_metrics.views+excluded.views,contacts=rental_property_metrics.contacts+excluded.contacts;
$$;
revoke all on function public.rental_consume_limit(text,integer,integer), public.rental_submit_order(uuid,text),public.rental_record_metric(uuid,text) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_consume_limit(text,integer,integer),public.rental_submit_order(uuid,text),public.rental_record_metric(uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('rental-assets','rental-assets',false,15728640,array['image/webp','image/jpeg','image/png','application/pdf'])
on conflict(id) do nothing;
-- Existing permissive object policies must never expose drafts or reports.
create policy rental_assets_server_only on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'rental-assets') with check(bucket_id<>'rental-assets');

comment on role eod_rental is 'API-only rental Auth identities. Not granted to authenticator: no direct member Data API, Storage, Realtime, or RPC access. Server portal APIs enforce owner scope.';
notify pgrst, 'reload schema';
