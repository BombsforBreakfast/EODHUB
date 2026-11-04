-- Shared identity is not shared authorization. Activation is a separate rollout
-- step after the application supports API-only Hub applicants.
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table auth.users,public.profiles in share row exclusive mode;
create temporary table portal_migration_baseline on commit drop as
select public.hub_member_signup_count() as hub_count,
  (select md5(coalesce(jsonb_agg(jsonb_build_object('id',u.id,'role',u.role,'app_metadata',u.raw_app_meta_data) order by u.id)::text,'')) from auth.users u) as auth_hash,
  (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.user_id,to_jsonb(p)::text)::text,'')) from public.profiles p) as profile_hash;
create schema if not exists portal_private;
revoke all on schema portal_private from public,anon,authenticated,eod_rental,eod_ticketing;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='eod_portal') then
    create role eod_portal nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if pg_has_role('authenticator','eod_portal','member') or pg_has_role('eod_portal','authenticated','member') then
    raise exception 'Shared portal identities must remain API-only';
  end if;
end $$;
create table public.portal_auth_settings(id boolean primary key default true check(id), enabled boolean not null default false);
insert into public.portal_auth_settings(id,enabled) values(true,false);
create table public.portal_access_requests(
  user_id uuid not null references auth.users(id) on delete cascade,
  portal text not null check(portal in ('hub','event_organizer')),
  status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
  review_note text not null default '', requested_at timestamptz not null default now(),
  reviewed_at timestamptz, reviewed_by uuid references auth.users(id),
  primary key(user_id,portal)
);
create index portal_access_requests_review on public.portal_access_requests(portal,status,requested_at);
create table public.portal_merge_requests(
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete cascade,
  other_user_id uuid not null references auth.users(id) on delete cascade,
  proof_digest text unique not null, proof_expires_at timestamptz not null,
  other_verified_at timestamptz, status text not null default 'awaiting_verification'
    check(status in ('awaiting_verification','pending_review','rejected','completed','canceled')),
  created_at timestamptz not null default now(), review_note text not null default '',
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  check(requested_by<>other_user_id)
);
create index portal_merge_requests_review on public.portal_merge_requests(status,created_at);
do $$ declare t text; begin
  foreach t in array array['portal_auth_settings','portal_access_requests','portal_merge_requests'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
-- Preserve every existing actual Hub profile, including pending applicants.
insert into public.portal_access_requests(user_id,portal,status)
select p.user_id,'hub',case when p.email_verified and p.admin_verified and p.verification_status='verified' then 'approved' else 'pending' end
from public.profiles p join auth.users u on u.id=p.user_id
where u.role not in ('eod_rental','eod_ticketing','eod_portal');

create function portal_private.full_hub_access(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_actor and (u.banned_until is null or u.banned_until<=now())
    and (p.is_pure_admin or p.account_type='business_org'
      or (p.email_verified and p.admin_verified and p.verification_status='verified')));
$$;
create function portal_private.prepare_identity() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if coalesce(new.role,'authenticated')='authenticated'
    and new.raw_app_meta_data->>'account_kind' is distinct from 'business_organization_page'
    and exists(select 1 from public.portal_auth_settings where id and enabled) then
    new.role:='eod_portal';
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')||'{"account_type":"shared_account"}'::jsonb;
  end if;
  return new;
end $$;
create trigger portal_prepare_new_identity before insert on auth.users
for each row execute function portal_private.prepare_identity();
create function portal_private.guard_identity_promotion() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.role='authenticated' and old.role in ('eod_portal','eod_rental','eod_ticketing')
    and not portal_private.full_hub_access(new.id) then
    new.role:=old.role;
  end if;
  return new;
end $$;
create trigger portal_guard_identity_promotion before update of role on auth.users
for each row execute function portal_private.guard_identity_promotion();

-- Existing rental and ticketing provisioning remains unchanged unless a user
-- has explicitly requested Hub access through the trusted server.
create or replace function public.guard_rental_member_profile() returns trigger
language plpgsql security definer set search_path='' as $$ declare u auth.users; begin
  select * into u from auth.users where id=new.user_id;
  if u.role in ('eod_portal','eod_rental') or u.raw_app_meta_data->>'account_type'='rental_provider' then
    if exists(select 1 from public.portal_access_requests where user_id=new.user_id and portal='hub') then return new; end if;
    if u.role='eod_rental' and u.raw_app_meta_data->>'account_type'='rental_provider' and tg_op='INSERT' then
      insert into public.rental_providers(user_id,full_name,phone,email,company,commitment_version)
      values(u.id,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'phone',lower(u.email),coalesce(u.raw_user_meta_data->>'company',''),'2026-10-27-v1') on conflict do nothing;
      return null;
    end if;
    if tg_op='INSERT' then return null; end if;
    raise exception 'Request Hub access before creating a Hub profile' using errcode='42501';
  end if;
  return new;
end $$;
create or replace function ticketing_private.guard_member_profile() returns trigger
language plpgsql security definer set search_path='' as $$ declare u auth.users; begin
  select * into u from auth.users where id=new.user_id;
  if u.role='eod_ticketing' or u.raw_app_meta_data->>'account_type'='ticketing_customer' then
    if exists(select 1 from public.portal_access_requests where user_id=new.user_id and portal='hub') then return new; end if;
    if tg_op='INSERT' then return null; end if;
    raise exception 'Request Hub access before creating a Hub profile' using errcode='42501';
  end if;
  return new;
end $$;
create function portal_private.finish_identity() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.role='eod_portal' and not exists(select 1 from public.portal_access_requests where user_id=new.id and portal='hub') then
    if exists(select 1 from public.profiles where user_id=new.id and
      (xmin<>pg_current_xact_id()::xid or created_at is distinct from transaction_timestamp())) then
      raise exception 'Established Hub identity cannot be silently converted' using errcode='42501';
    end if;
    delete from public.profiles where user_id=new.id and xmin=pg_current_xact_id()::xid and created_at=transaction_timestamp();
  end if;
  return new;
end $$;
create trigger portal_finish_identity after update of role,raw_app_meta_data on auth.users
for each row execute function portal_private.finish_identity();

create function public.portal_request_hub(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$ declare u auth.users; begin
  select * into strict u from auth.users where id=p_actor;
  if u.banned_until>now() then raise insufficient_privilege; end if;
  insert into public.portal_access_requests(user_id,portal) values(p_actor,'hub') on conflict do nothing;
  insert into public.profiles(user_id,email,verification_status) values(p_actor,u.email,'pending') on conflict do nothing;
end $$;
create function portal_private.sync_hub_role() returns trigger
language plpgsql security definer set search_path='' as $$ declare next_role text; begin
  if exists(select 1 from public.portal_access_requests where user_id=new.user_id and portal='hub') then
    next_role:=case when portal_private.full_hub_access(new.user_id) then 'authenticated' else 'eod_portal' end;
    update public.portal_access_requests set status=case when portal_private.full_hub_access(new.user_id) then 'approved' when new.verification_status='denied' then 'rejected' else 'pending' end
      where user_id=new.user_id and portal='hub';
    -- Legacy ordinary applicants retain their existing workflow. New shared
    -- applicants and upgraded portal identities follow current Hub approval.
    update auth.users set role=next_role,
      raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||'{"account_type":"shared_account"}'::jsonb
      where id=new.user_id and (role in ('eod_portal','eod_rental','eod_ticketing') or raw_app_meta_data->>'account_type'='shared_account')
      and role is distinct from next_role;
  end if;
  return new;
end $$;
create trigger portal_sync_hub_access after insert or update of email_verified,admin_verified,verification_status,is_pure_admin,account_type on public.profiles
for each row execute function portal_private.sync_hub_role();

-- Current identity state, including bans, is checked even for unexpired old
-- authenticated tokens. The pre-request hook also protects definer RPCs/views.
create function public.portal_current_hub_identity() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.users u where u.id=(select auth.uid())
    and u.role='authenticated' and (u.banned_until is null or u.banned_until<=now()));
$$;
create function public.portal_check_data_request() returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.jwt()->>'role'='authenticated' and not public.portal_current_hub_identity() then
    raise exception 'Hub access is not active. Refresh your sign-in.' using errcode='42501';
  end if;
end $$;
do $$ declare previous text; t record; begin
  select split_part(c,'=',2) into previous from pg_roles r cross join lateral unnest(r.rolconfig) c
    where r.rolname='authenticator' and c like 'pgrst.db_pre_request=%';
  if coalesce(previous,'') not in ('','public.portal_check_data_request') then raise exception 'Existing pre-request hook must be preserved and composed'; end if;
  for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
    execute format('create policy portal_identity_current on public.%I as restrictive for all to authenticated using ((select public.portal_current_hub_identity())) with check ((select public.portal_current_hub_identity()))',t.tablename);
  end loop;
end $$;
create policy portal_identity_current on storage.objects as restrictive for all to authenticated
using ((select public.portal_current_hub_identity())) with check ((select public.portal_current_hub_identity()));
alter role authenticator set pgrst.db_pre_request='public.portal_check_data_request';

-- Keep the current submitted-Hub-profile total, including pending applications.
-- Having a provider row must not exclude an otherwise genuine Hub applicant.
create or replace function public.hub_member_signup_count() returns bigint
language sql stable security definer set search_path='' as $$
  select count(*) from public.profiles p left join auth.users u on u.id=p.user_id
  where coalesce(u.role,'') not in ('eod_rental','eod_ticketing','eod_portal')
    or exists(select 1 from public.portal_access_requests q where q.user_id=p.user_id and q.portal='hub');
$$;
create function public.portal_auth_details(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('hasPassword',coalesce(u.encrypted_password,'')<>'') from auth.users u where u.id=p_actor;
$$;
create function public.portal_review_organizer(p_actor uuid,p_user uuid,p_decision text,p_note text) returns void
language plpgsql security definer set search_path='' as $$ begin
  if not exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    where p.user_id=p_actor and p.is_admin and p.user_id='a28ddac8-dc3a-4ae1-83f5-b675e7b85871'::uuid
      and lower(u.email)='micheal.p.twigg@gmail.com' and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())) then raise insufficient_privilege; end if;
  if p_decision not in ('approved','rejected','suspended') then raise exception 'Invalid review decision'; end if;
  if length(trim(coalesce(p_note,'')))<3 and p_decision<>'approved' then raise exception 'Add a review note'; end if;
  perform 1 from public.portal_access_requests where user_id=p_user and portal='event_organizer' for update;
  if not found then raise exception 'No organizer request'; end if;
  if p_decision='approved' and exists(select 1 from public.ticketing_accounts where user_id=p_user and not active) then
    raise exception 'Suspended event account needs separate administrator review' using errcode='42501';
  end if;
  update public.portal_access_requests set status=p_decision,review_note=left(coalesce(p_note,''),1500),reviewed_by=p_actor,reviewed_at=now()
    where user_id=p_user and portal='event_organizer';
  insert into public.ticketing_accounts(user_id,can_submit_events) values(p_user,p_decision='approved')
    on conflict(user_id) do update set can_submit_events=excluded.can_submit_events;
  insert into public.ticketing_audit(actor_id,action,details) values(p_actor,'organizer_access_review',jsonb_build_object('user_id',p_user,'decision',p_decision));
end $$;
revoke all on all functions in schema portal_private from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
revoke all on function public.portal_request_hub(uuid),public.portal_auth_details(uuid) from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
grant execute on function public.portal_request_hub(uuid),public.portal_auth_details(uuid) to service_role;
revoke all on function public.portal_review_organizer(uuid,uuid,text,text) from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
grant execute on function public.portal_review_organizer(uuid,uuid,text,text) to service_role;
revoke all on function public.portal_current_hub_identity(),public.portal_check_data_request() from public,anon,eod_rental,eod_ticketing,eod_portal;
grant execute on function public.portal_current_hub_identity(),public.portal_check_data_request() to authenticated,service_role;
grant execute on function public.portal_check_data_request() to anon;
revoke all on function public.hub_member_signup_count() from public,anon,authenticated,eod_rental,eod_ticketing,eod_portal;
grant execute on function public.hub_member_signup_count() to service_role;
notify pgrst,'reload config';
notify pgrst,'reload schema';
do $$ begin
  if (select hub_count from portal_migration_baseline)<>public.hub_member_signup_count() then raise exception 'Migration changed the existing Hub profile total'; end if;
  if (select auth_hash from portal_migration_baseline) is distinct from
    (select md5(coalesce(jsonb_agg(jsonb_build_object('id',u.id,'role',u.role,'app_metadata',u.raw_app_meta_data) order by u.id)::text,'')) from auth.users u)
    then raise exception 'Migration changed an existing Auth identity'; end if;
  if (select profile_hash from portal_migration_baseline) is distinct from
    (select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.user_id,to_jsonb(p)::text)::text,'')) from public.profiles p)
    then raise exception 'Migration changed an existing Hub profile'; end if;
end $$;
