-- Ticketing pilot only. No checkout, charge, membership approval or public launch.
-- Access is through verified, assignment-checked server APIs; never direct clients.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='eod_ticketing') then
    create role eod_ticketing nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if pg_has_role('authenticator','eod_ticketing','MEMBER') or pg_has_role('eod_ticketing','authenticated','MEMBER') then
    raise exception 'Ticketing role must remain API-only';
  end if;
end $$;

create schema if not exists ticketing_private;
revoke all on schema ticketing_private from public,anon,authenticated,eod_rental,eod_ticketing;
grant usage on schema ticketing_private to service_role;

create table public.ticketing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  can_submit_events boolean not null default false,
  profile jsonb,
  created_at timestamptz not null default now(),
  check(profile is null or (jsonb_typeof(profile)='object' and octet_length(profile::text)<10000))
);
create table public.ticketing_sessions (
  digest text primary key check(length(digest)=64),
  user_id uuid not null references public.ticketing_accounts(user_id) on delete cascade,
  origin text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index ticketing_sessions_user on public.ticketing_sessions(user_id,expires_at);
create table public.ticketing_login_requests (
  digest text primary key check(length(digest)=64),
  user_id uuid not null references public.ticketing_accounts(user_id) on delete cascade,
  origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ticketing_login_requests_expiry on public.ticketing_login_requests(expires_at);
create table public.ticketing_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'pilot' check(environment='pilot'),
  created_by uuid references public.ticketing_accounts(user_id) on delete set null,
  draft jsonb not null default '{}',
  event jsonb,
  revision integer not null default 1 check(revision>0),
  review_status text not null default 'draft' check(review_status in ('draft','pending','approved','changes_requested','rejected')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  listed boolean not null default false,
  checkout_enabled boolean not null default false check(checkout_enabled=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(jsonb_typeof(draft)='object' and octet_length(draft::text)<24000),
  check(event is null or (jsonb_typeof(event)='object' and octet_length(event::text)<24000)),
  check(not listed or (review_status='approved' and event is not null))
);
create index ticketing_events_review on public.ticketing_events(review_status,created_at);
create table public.ticketing_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.ticketing_events(id),
  user_id uuid not null references public.ticketing_accounts(user_id) on delete cascade,
  role text not null check(role in ('coordinator','checkin_staff')),
  expires_at timestamptz,
  revoked_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(event_id,user_id,role),
  check(role<>'checkin_staff' or expires_at is not null)
);
create index ticketing_assignments_user on public.ticketing_assignments(user_id,event_id);
create table public.ticketing_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check(email=lower(trim(email)) and length(email)<=254),
  role text not null check(role in ('customer','coordinator','checkin_staff')),
  event_id uuid references public.ticketing_events(id),
  digest text not null unique check(length(digest)=64),
  expires_at timestamptz not null,
  access_expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(role<>'checkin_staff' or (event_id is not null and access_expires_at is not null))
);
create index ticketing_invitations_email on public.ticketing_invitations(email,expires_at);
create table public.ticketing_audit (
  id bigint generated always as identity primary key,
  event_id uuid references public.ticketing_events(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index ticketing_audit_event on public.ticketing_audit(event_id,created_at desc);
create table public.ticketing_limits (key text primary key,hits integer not null,expires_at timestamptz not null);
create table public.ticketing_flyers (
  id uuid primary key,
  uploader_id uuid references public.ticketing_accounts(user_id) on delete set null,
  path text not null unique,
  created_at timestamptz not null default now()
);
create index ticketing_flyers_uploader on public.ticketing_flyers(uploader_id,created_at);
create table public.ticketing_email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  delivered_to_provider boolean not null,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['ticketing_accounts','ticketing_sessions','ticketing_login_requests','ticketing_events','ticketing_assignments','ticketing_invitations','ticketing_audit','ticketing_limits','ticketing_flyers','ticketing_email_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,eod_rental,eod_ticketing',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;
revoke all on sequence public.ticketing_audit_id_seq from public,anon,authenticated,eod_rental,eod_ticketing;
grant usage,select on sequence public.ticketing_audit_id_seq to service_role;

-- Existing signup triggers remain. Only this server-provisioned Auth scope is
-- intercepted; ordinary member/rental writes still return NEW unchanged.
create function ticketing_private.guard_member_profile() returns trigger
language plpgsql security definer set search_path='' as $$ declare u auth.users; begin
  select * into u from auth.users where id=new.user_id;
  if u.role='eod_ticketing' or u.raw_app_meta_data->>'account_type'='ticketing_customer' then
    if u.role<>'eod_ticketing' or u.raw_app_meta_data->>'account_type' is distinct from 'ticketing_customer' then
      raise exception 'Ticketing identities require server provisioning' using errcode='42501';
    end if;
    if tg_op='INSERT' then return null; end if;
    raise exception 'Events-only identities cannot have Hub profiles' using errcode='42501';
  end if;
  return new;
end $$;
create trigger prevent_ticketing_hub_profile before insert or update on public.profiles
for each row execute function ticketing_private.guard_member_profile();

-- GoTrue initially inserts an ordinary placeholder before assigning custom role
-- and app_metadata. Remove only a placeholder from this exact transaction.
create function ticketing_private.finish_auth_provisioning() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if new.role='eod_ticketing' and new.raw_app_meta_data->>'account_type'='ticketing_customer' then
    if exists(select 1 from public.profiles where user_id=new.id) then
      if exists(select 1 from public.profiles where user_id=new.id and
        (xmin<>pg_current_xact_id()::xid or created_at is distinct from transaction_timestamp())) then
        raise exception 'Established Hub accounts must keep their membership identity' using errcode='42501';
      end if;
      delete from public.profiles where user_id=new.id and xmin=pg_current_xact_id()::xid and created_at=transaction_timestamp();
    end if;
    insert into public.ticketing_accounts(user_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger ensure_ticketing_auth_provisioning after update of role,raw_app_meta_data on auth.users
for each row execute function ticketing_private.finish_auth_provisioning();
revoke all on all functions in schema ticketing_private from public,anon,authenticated,eod_rental,eod_ticketing;

create function public.ticketing_is_admin(p_actor uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
    join public.ticketing_accounts a on a.user_id=p.user_id and a.active
    where p.user_id=p_actor and p_actor='a28ddac8-dc3a-4ae1-83f5-b675e7b85871'::uuid
    and lower(u.email)='micheal.p.twigg@gmail.com' and p.is_admin=true)
$$;
create function public.ticketing_has_access(p_actor uuid,p_event uuid,p_scan boolean default false) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.ticketing_accounts a where a.user_id=p_actor and a.active and
    (public.ticketing_is_admin(p_actor) or exists(select 1 from public.ticketing_assignments s
      where s.user_id=p_actor and s.event_id=p_event and s.revoked_at is null
      and (s.expires_at is null or s.expires_at>now()) and (p_scan or s.role='coordinator'))))
$$;
create function public.ticketing_consume_limit(p_key text,p_limit integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$ declare n integer; begin
  if p_limit not between 1 and 1000 or p_seconds not between 1 and 86400 or length(p_key)>200 then raise exception 'Invalid limit'; end if;
  insert into public.ticketing_limits(key,hits,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set hits=case when ticketing_limits.expires_at<now() then 1 else ticketing_limits.hits+1 end,
    expires_at=case when ticketing_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else ticketing_limits.expires_at end returning hits into n;
  return n<=p_limit;
end $$;
create function public.ticketing_start_session(p_digest text,p_actor uuid,p_origin text,p_session_digest text) returns boolean
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_login_requests; begin
  select * into r from public.ticketing_login_requests where digest=p_digest for update;
  if not found or r.user_id<>p_actor or r.origin<>p_origin or r.consumed_at is not null or r.expires_at<=now()
    or not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then return false; end if;
  update public.ticketing_login_requests set consumed_at=now() where digest=p_digest;
  insert into public.ticketing_sessions(digest,user_id,origin,expires_at) values(p_session_digest,p_actor,p_origin,now()+interval '24 hours');
  return true;
end $$;
create function public.ticketing_save_event(p_actor uuid,p_id uuid,p_expected integer,p_draft jsonb,p_event jsonb,p_submit boolean) returns public.ticketing_events
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_events; begin
  if not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then raise exception 'Access denied' using errcode='42501'; end if;
  select * into r from public.ticketing_events where id=p_id for update;
  if not found then
    if p_expected is null or p_expected<>0 or not exists(select 1 from public.ticketing_accounts where user_id=p_actor and (can_submit_events or public.ticketing_is_admin(p_actor))) then
      raise exception 'Event creation not permitted' using errcode='42501'; end if;
    insert into public.ticketing_events(id,created_by) values(p_id,p_actor) returning * into r;
    if not public.ticketing_is_admin(p_actor) then
      insert into public.ticketing_assignments(event_id,user_id,role,assigned_by) values(p_id,p_actor,'coordinator',p_actor);
    end if;
  else
    if not public.ticketing_has_access(p_actor,p_id) then raise exception 'Access denied' using errcode='42501'; end if;
    if p_expected is null or r.revision<>p_expected then raise exception 'This event changed. Reload before saving.' using errcode='40001'; end if;
  end if;
  if p_submit and (p_event is null or not(p_event ?& array['title','startsAt','timeZone','capacity','priceCents'])) then raise exception 'Complete event details'; end if;
  update public.ticketing_events set draft=p_draft,event=case when p_submit then p_event else null end,
    review_status=case when p_submit then 'pending' else 'draft' end,review_note='',reviewed_by=null,listed=false,
    revision=r.revision+1,updated_at=now() where id=p_id returning * into r;
  insert into public.ticketing_audit(event_id,actor_id,action) values(p_id,p_actor,case when p_submit then 'submitted' else 'draft_saved' end);
  return r;
end $$;
create function public.ticketing_review_event(p_actor uuid,p_id uuid,p_expected integer,p_decision text,p_note text) returns public.ticketing_events
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_events; begin
  if not public.ticketing_is_admin(p_actor) then raise exception 'Owner review required' using errcode='42501'; end if;
  select * into r from public.ticketing_events where id=p_id for update;
  if not found or p_expected is null or r.revision<>p_expected then raise exception 'This event changed. Reload before reviewing.' using errcode='40001'; end if;
  if r.review_status<>'pending' or p_decision not in ('approved','changes_requested','rejected') or length(p_note)>1500
    or (p_decision<>'approved' and length(trim(p_note))<3) then raise exception 'Choose a review decision and note'; end if;
  update public.ticketing_events set review_status=p_decision,review_note=p_note,reviewed_by=p_actor,listed=false,
    revision=revision+1,updated_at=now() where id=p_id returning * into r;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(p_id,p_actor,p_decision,jsonb_build_object('note',p_note));
  return r;
end $$;
create function public.ticketing_invite(p_actor uuid,p_email text,p_role text,p_event uuid,p_digest text,p_access_until timestamptz) returns uuid
language plpgsql security invoker set search_path='' as $$ declare result uuid; begin
  if not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then raise exception 'Access denied' using errcode='42501'; end if;
  if not public.ticketing_is_admin(p_actor) and (p_role<>'checkin_staff' or p_event is null or not public.ticketing_has_access(p_actor,p_event)) then
    raise exception 'Only owner can appoint coordinators or customers' using errcode='42501'; end if;
  if p_event is not null and not exists(select 1 from public.ticketing_events where id=p_event) then raise exception 'Unknown event'; end if;
  if p_role='checkin_staff' and (p_access_until is null or p_access_until<=now()) then raise exception 'Future operator expiry required'; end if;
  update public.ticketing_invitations set revoked_at=now() where email=p_email and role=p_role and event_id is not distinct from p_event and accepted_at is null and revoked_at is null;
  insert into public.ticketing_invitations(email,role,event_id,digest,expires_at,access_expires_at,created_by)
    values(p_email,p_role,p_event,p_digest,now()+interval '7 days',p_access_until,p_actor) returning id into result;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(p_event,p_actor,'invitation_created',jsonb_build_object('invitation',result,'role',p_role));
  return result;
end $$;
create function public.ticketing_accept_invite(p_actor uuid,p_digest text) returns boolean
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_invitations; actor_email text; begin
  select lower(email) into actor_email from auth.users where id=p_actor and email_confirmed_at is not null;
  if actor_email is null or not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then raise exception 'Verify your email first' using errcode='42501'; end if;
  select * into r from public.ticketing_invitations where digest=p_digest for update;
  if not found or r.email<>actor_email or r.revoked_at is not null or r.expires_at<=now()
    or (r.access_expires_at is not null and r.access_expires_at<=now()) then raise exception 'Invitation is unavailable for this email' using errcode='42501'; end if;
  if r.accepted_at is not null then return r.accepted_by=p_actor; end if;
  -- An inviter losing coordinator privileges invalidates an outstanding grant.
  if not public.ticketing_is_admin(r.created_by) and (r.role<>'checkin_staff' or not public.ticketing_has_access(r.created_by,r.event_id)) then
    raise exception 'Invitation is no longer authorized' using errcode='42501'; end if;
  if r.role='coordinator' and r.event_id is null then
    update public.ticketing_accounts set can_submit_events=true where user_id=p_actor;
  elsif r.role<>'customer' then
    insert into public.ticketing_assignments(event_id,user_id,role,expires_at,assigned_by)
      values(r.event_id,p_actor,r.role,r.access_expires_at,r.created_by)
    on conflict(event_id,user_id,role) do update set expires_at=excluded.expires_at,revoked_at=null,assigned_by=excluded.assigned_by;
  end if;
  update public.ticketing_invitations set accepted_at=now(),accepted_by=p_actor where id=r.id;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(r.event_id,p_actor,'invitation_accepted',jsonb_build_object('role',r.role));
  return true;
end $$;
create function public.ticketing_revoke_assignment(p_actor uuid,p_id uuid) returns boolean
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_assignments; begin
  select * into r from public.ticketing_assignments where id=p_id for update;
  if not found then return false; end if;
  if not public.ticketing_is_admin(p_actor) and (r.role<>'checkin_staff' or not public.ticketing_has_access(p_actor,r.event_id)) then
    raise exception 'Access denied' using errcode='42501'; end if;
  update public.ticketing_assignments set revoked_at=now() where id=p_id;
  insert into public.ticketing_audit(event_id,actor_id,action,details) values(r.event_id,p_actor,'assignment_revoked',jsonb_build_object('assignment',p_id));
  return true;
end $$;

-- New private media bucket is explicitly fenced off from permissive legacy
-- policies. Other buckets' behavior is unchanged.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ticketing-pilot-media','ticketing-pilot-media',false,6291456,array['image/webp']);
create policy ticketing_pilot_media_server_only on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'ticketing-pilot-media') with check(bucket_id<>'ticketing-pilot-media');

do $$ declare f record; begin
  for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'ticketing\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated,eod_rental,eod_ticketing',f.name);
    execute format('grant execute on function %s to service_role',f.name);
  end loop;
end $$;
comment on role eod_ticketing is 'Events-only Auth identity; never granted to authenticator. No direct Hub Data API, Storage, Realtime or RPC access.';

-- Verify against actual shared-project triggers inside the migration transaction.
-- Every disposable fixture is removed below; any test error aborts migration.
-- Disposable validation fixtures are removed before this migration completes.
do $$
<<ticketing_qa>>
declare
  coord_a uuid:=gen_random_uuid(); coord_b uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid(); existing_member uuid:=gen_random_uuid();
  owner_id uuid:='a28ddac8-dc3a-4ae1-83f5-b675e7b85871';
  event_a uuid:=gen_random_uuid(); event_b uuid:=gen_random_uuid(); user_id uuid;
  a public.ticketing_events; b public.ticketing_events; invite_id uuid; assignment_id uuid; caught boolean;
  fixture_email text; target_email text; bucket_policy boolean; member_count bigint; owner_had_account boolean;
begin
  if pg_has_role('authenticator','eod_ticketing','MEMBER') or pg_has_role('eod_ticketing','authenticated','MEMBER') then raise exception 'API-only role is switchable'; end if;
  if exists(select 1 from pg_tables where schemaname='public' and tablename like 'ticketing\_%' escape '\' and not rowsecurity) then raise exception 'Missing RLS'; end if;
  if exists(select 1 from information_schema.table_privileges where table_schema='public' and table_name like 'ticketing\_%' escape '\' and grantee in ('anon','authenticated','eod_rental','eod_ticketing','PUBLIC')) then raise exception 'Direct table grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='public' and p.proname like 'ticketing\_%' escape '\' and has_function_privilege('anon',p.oid,'EXECUTE')) then raise exception 'Anonymous RPC grant'; end if;
  select not polpermissive into bucket_policy from pg_policy where polrelid='storage.objects'::regclass and polname='ticketing_pilot_media_server_only';
  if bucket_policy is distinct from true then raise exception 'Missing restrictive storage fence'; end if;

  -- Exercise the real signup/profile triggers in GoTrue's insert-then-update
  -- order. Editable user metadata cannot approve community membership.
  select public.hub_member_signup_count() into member_count;
  foreach user_id in array array[coord_a,coord_b,customer,operator_id] loop
    fixture_email:='ticketing-'||user_id::text||'@example.invalid';
    insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at,created_at)
      values(user_id,fixture_email,'authenticated','{}','{"is_admin":true,"can_submit_events":true}',now(),now());
    update auth.users set role='eod_ticketing',raw_app_meta_data='{"account_type":"ticketing_customer"}' where id=user_id;
    if exists(select 1 from public.profiles where profiles.user_id=ticketing_qa.user_id) then raise exception 'Events-only account received member profile'; end if;
    if not exists(select 1 from public.ticketing_accounts where ticketing_accounts.user_id=ticketing_qa.user_id and not can_submit_events) then raise exception 'Provisioning failed or metadata granted organizer access'; end if;
  end loop;
  if public.hub_member_signup_count()<>member_count then raise exception 'Events-only fixtures affected Hub signup count'; end if;

  -- Established members keep their identity and cannot be converted to an
  -- events-only role. Simulate the existing profile's earlier creation date.
  insert into auth.users(id,email,role,raw_app_meta_data,created_at)
    values(existing_member,'ticketing-member-'||existing_member::text||'@example.invalid','authenticated','{}',now());
  if not exists(select 1 from public.profiles where profiles.user_id=existing_member and verification_status='pending') then raise exception 'Normal Hub signup did not receive its pending profile'; end if;
  update public.profiles set created_at=now()-interval '1 day' where profiles.user_id=existing_member;
  caught:=false;
  begin update auth.users set role='eod_ticketing',raw_app_meta_data='{"account_type":"ticketing_customer"}' where id=existing_member;
  exception when insufficient_privilege then caught:=true; end;
  if not caught or not exists(select 1 from public.profiles where profiles.user_id=existing_member) then raise exception 'Established membership not preserved'; end if;
  update auth.users set raw_user_meta_data='{"name":"Normal Hub QA"}' where id=existing_member;
  if not exists(select 1 from auth.users where id=existing_member and role='authenticated') then raise exception 'Normal Auth role changed'; end if;
  insert into public.ticketing_accounts(user_id) values(existing_member);
  insert into public.ticketing_sessions(digest,user_id,origin,expires_at) values(repeat('b',64),existing_member,'https://pilot.example.invalid',now()+interval '1 hour');

  select exists(select 1 from public.ticketing_accounts where ticketing_accounts.user_id=owner_id) into owner_had_account;
  insert into public.ticketing_accounts(user_id) values(owner_id) on conflict do nothing;
  if not public.ticketing_is_admin(owner_id) then raise exception 'Expected existing Hub owner fixture'; end if;
  update public.ticketing_accounts set can_submit_events=true where ticketing_accounts.user_id in (coord_a,coord_b);
  a:=public.ticketing_save_event(coord_a,event_a,0,'{"title":"Database pilot A"}',null,false);
  b:=public.ticketing_save_event(coord_b,event_b,0,'{"title":"Database pilot B"}',null,false);
  if not public.ticketing_has_access(coord_a,event_a) or public.ticketing_has_access(coord_a,event_b) then raise exception 'Coordinator event isolation failed'; end if;
  if not public.ticketing_has_access(owner_id,event_b) then raise exception 'Owner oversight missing'; end if;
  caught:=false;
  begin perform public.ticketing_save_event(coord_a,event_b,b.revision,'{"title":"Unauthorized"}',null,false);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Cross-event write allowed'; end if;
  caught:=false;
  begin perform public.ticketing_save_event(customer,gen_random_uuid(),0,'{}',null,false);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Customer could create events'; end if;

  a:=public.ticketing_save_event(coord_a,event_a,a.revision,'{"title":"Saved from second device"}',null,false);
  caught:=false;
  begin perform public.ticketing_save_event(coord_a,event_a,a.revision-1,'{"title":"Stale tab"}',null,false);
  exception when serialization_failure then caught:=true; end;
  if not caught then raise exception 'Stale overwrite was accepted'; end if;
  caught:=false;
  begin perform public.ticketing_save_event(coord_a,event_a,null,'{"title":"Missing revision"}',null,false);
  exception when serialization_failure then caught:=true; end;
  if not caught then raise exception 'Missing revision bypassed conflict protection'; end if;

  insert into public.ticketing_assignments(event_id,user_id,role,expires_at,assigned_by)
    values(event_a,operator_id,'checkin_staff',now()+interval '1 hour',coord_a) returning id into assignment_id;
  if not public.ticketing_has_access(operator_id,event_a,true) or public.ticketing_has_access(operator_id,event_a,false)
    or public.ticketing_has_access(operator_id,event_b,true) then raise exception 'Operator scope invalid'; end if;
  caught:=false;
  begin perform public.ticketing_save_event(operator_id,event_a,a.revision,'{}',null,false);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Operator changed event'; end if;
  update public.ticketing_assignments set expires_at=now()-interval '1 second' where id=assignment_id;
  if public.ticketing_has_access(operator_id,event_a,true) then raise exception 'Expired access allowed'; end if;
  update public.ticketing_assignments set expires_at=now()+interval '1 hour' where id=assignment_id;
  perform public.ticketing_revoke_assignment(coord_a,assignment_id);
  if public.ticketing_has_access(operator_id,event_a,true) then raise exception 'Revocation did not take effect'; end if;

  select email into target_email from auth.users where id=customer;
  caught:=false;
  begin perform public.ticketing_invite(coord_a,target_email,'coordinator',event_a,repeat('c',64),null);
  exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Coordinator appointed another coordinator'; end if;
  invite_id:=public.ticketing_invite(coord_a,target_email,'checkin_staff',event_a,repeat('d',64),now()+interval '1 hour');
  caught:=false;
  begin perform public.ticketing_accept_invite(coord_b,repeat('d',64)); exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Invitation accepted by wrong email'; end if;
  if not public.ticketing_accept_invite(customer,repeat('d',64)) then raise exception 'Invitation acceptance failed'; end if;
  if not public.ticketing_has_access(customer,event_a,true) then raise exception 'Accepted invitation did not grant scanner access'; end if;
  if public.ticketing_has_access(customer,event_a,false) then raise exception 'Operator invitation granted management'; end if;
  if not public.ticketing_accept_invite(customer,repeat('d',64)) then raise exception 'Same-user retry not idempotent'; end if;

  insert into public.ticketing_login_requests(digest,user_id,origin,expires_at)
    values(repeat('e',64),customer,'https://pilot.example.invalid',now()+interval '30 minutes');
  if public.ticketing_start_session(repeat('e',64),coord_b,'https://pilot.example.invalid',repeat('f',64)) then raise exception 'Wrong user started session'; end if;
  if public.ticketing_start_session(repeat('e',64),customer,'https://other.example.invalid',repeat('f',64)) then raise exception 'Cross-origin session'; end if;
  if not public.ticketing_start_session(repeat('e',64),customer,'https://pilot.example.invalid',repeat('f',64)) then raise exception 'Valid session failed'; end if;
  if public.ticketing_start_session(repeat('e',64),customer,'https://pilot.example.invalid',repeat('a',64)) then raise exception 'Link replay created session'; end if;

  a:=public.ticketing_save_event(coord_a,event_a,a.revision,'{"title":"Ready for review"}',
    '{"title":"Ready for review","startsAt":"2026-12-05T14:00:00Z","timeZone":"America/New_York","capacity":10,"priceCents":3000}',true);
  caught:=false;
  begin perform public.ticketing_review_event(coord_a,event_a,a.revision,'approved',''); exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'Coordinator self-approved'; end if;
  a:=public.ticketing_review_event(owner_id,event_a,a.revision,'approved','Reviewed pilot');
  if a.review_status<>'approved' or a.checkout_enabled or a.listed then raise exception 'Review opened sales or listed event'; end if;
  caught:=false;
  begin update public.ticketing_events set checkout_enabled=true where id=event_a; exception when check_violation then caught:=true; end;
  if not caught then raise exception 'Pilot checkout guard missing'; end if;
  a:=public.ticketing_save_event(coord_a,event_a,a.revision,'{"title":"Edited after review"}',null,false);
  if a.review_status<>'draft' or a.listed then raise exception 'Edit retained approval'; end if;

  update public.ticketing_accounts set active=false where ticketing_accounts.user_id=coord_b;
  if public.ticketing_has_access(coord_b,event_b) then raise exception 'Suspended account retained access'; end if;
  raise notice 'PASS: ticketing database provisioning, grants, role isolation, invitations, revision conflicts, revocation, session replay and review checks';
  delete from public.ticketing_sessions where ticketing_sessions.user_id in (coord_a,coord_b,customer,operator_id);
  delete from public.ticketing_login_requests where ticketing_login_requests.user_id in (coord_a,coord_b,customer,operator_id);
  delete from public.ticketing_audit where event_id in (event_a,event_b);
  delete from public.ticketing_invitations where created_by in (coord_a,coord_b,customer,operator_id);
  delete from public.ticketing_assignments where event_id in (event_a,event_b);
  delete from public.ticketing_events where id in (event_a,event_b);
  delete from public.ticketing_accounts where ticketing_accounts.user_id in (coord_a,coord_b,customer,operator_id);
  if not owner_had_account then delete from public.ticketing_accounts where ticketing_accounts.user_id=owner_id; end if;
  delete from public.profiles where profiles.user_id=existing_member;
  delete from auth.users where id in (coord_a,coord_b,customer,operator_id,existing_member);
  if exists(select 1 from public.ticketing_accounts where ticketing_accounts.user_id=existing_member)
    or exists(select 1 from public.ticketing_sessions where ticketing_sessions.user_id=existing_member) then raise exception 'Ticketing blocked ordinary account deletion'; end if;
  if public.hub_member_signup_count()<>member_count then raise exception 'Fixture cleanup changed Hub signup count'; end if;
end $$;
