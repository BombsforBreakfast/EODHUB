-- Standalone paid newsletter. No auth users, profiles, or member entitlements.
create schema if not exists job_report_private;
revoke all on schema job_report_private from public, anon, authenticated;
grant usage on schema job_report_private to service_role;

create table public.job_report_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email=lower(trim(email)) and length(email)<=254),
  livemode boolean not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_created bigint not null default 0,
  status text not null default 'pending',
  paid_until timestamptz,
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  risk_hold boolean not null default false,
  cancel_at_period_end boolean not null default false,
  initial_job_ids uuid[] not null default '{}',
  initial_prepared boolean not null default false,
  checkout_key uuid not null default gen_random_uuid(),
  checkout_session_id text,
  checkout_started_at timestamptz not null default now(),
  manage_requested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique(email,livemode)
);
create table public.job_report_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  cutoff timestamptz not null,
  jobs jsonb not null,
  created_at timestamptz not null default now()
);
create table public.job_report_approvals (
  job_id uuid primary key,
  approved_at timestamptz not null default clock_timestamp(),
  snapshot jsonb not null,
  withdrawn boolean not null default false,
  report_id uuid references public.job_report_reports(id)
);
create index job_report_pending_approvals on public.job_report_approvals(approved_at) where report_id is null and not withdrawn;
create table public.job_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references public.job_report_subscribers(id),
  report_id uuid references public.job_report_reports(id),
  message_key text not null unique,
  kind text not null check(kind in ('report','initial','welcome','manage','alert')),
  recipient text not null,
  payload jsonb not null,
  livemode boolean not null,
  status text not null default 'pending' check(status in ('pending','accepted','delivered','suppressed','ambiguous','expired')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  expires_at timestamptz,
  resend_message_id text unique,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index job_report_pending_delivery on public.job_report_deliveries(next_attempt_at) where status='pending';
create table public.job_report_manage_tokens (
  token_hash text primary key,
  subscriber_id uuid not null references public.job_report_subscribers(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

do $$ declare t text; begin
  foreach t in array array['job_report_subscribers','job_report_reports','job_report_approvals','job_report_deliveries','job_report_manage_tokens'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

create function job_report_private.snapshot_job(j public.jobs) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',j.id,'title',j.title,'company',j.company_name,'location',j.location,
   'payMin',j.pay_min,'payMax',j.pay_max,'description',left(coalesce(j.description,''),1200),
   'applyUrl',j.apply_url,'source',j.source_type)
$$;
create function job_report_private.capture_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.is_approved is true and new.is_rejected is not true then
   if tg_op='INSERT' then
     insert into public.job_report_approvals(job_id,snapshot) values(new.id,job_report_private.snapshot_job(new)) on conflict do nothing;
   elsif old.is_approved is not true or old.is_rejected is true then
     insert into public.job_report_approvals(job_id,snapshot) values(new.id,job_report_private.snapshot_job(new))
       on conflict(job_id) do update set snapshot=excluded.snapshot,withdrawn=false where job_report_approvals.report_id is null;
   end if;
 else
   update public.job_report_approvals set withdrawn=true where job_id=new.id and report_id is null;
 end if;
 return new;
end $$;
revoke all on function job_report_private.snapshot_job(public.jobs), job_report_private.capture_approval() from public,anon,authenticated;
grant execute on function job_report_private.snapshot_job(public.jobs) to service_role;
-- Existing approved inventory is deliberately not backfilled into the daily queue.
create trigger job_report_first_approval after insert or update of is_approved,is_rejected on public.jobs
for each row execute function job_report_private.capture_approval();

create function public.job_report_reserve(p_email text,p_live boolean,p_renew boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.job_report_subscribers;
begin
 insert into public.job_report_subscribers(email,livemode) values(lower(trim(p_email)),p_live) on conflict(email,livemode) do nothing;
 select * into s from public.job_report_subscribers where email=lower(trim(p_email)) and livemode=p_live for update;
 if s.status in ('pending','incomplete_expired','canceled') and (s.checkout_started_at<now()-interval '40 minutes' or p_renew) then
   update public.job_report_subscribers set checkout_key=gen_random_uuid(),checkout_session_id=null,checkout_started_at=now() where id=s.id returning * into s;
 end if;
 return to_jsonb(s);
end $$;

create function public.job_report_sync(p_id uuid,p_customer text,p_subscription text,p_created bigint,p_status text,p_paid_until timestamptz,p_cancel boolean,p_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.job_report_subscribers; is_new boolean;
begin
 select * into s from public.job_report_subscribers where id=p_id for update;
 if not found or (s.stripe_customer_id is not null and s.stripe_customer_id<>p_customer) then raise exception 'Job Report customer mismatch'; end if;
 if s.subscription_created>p_created then return to_jsonb(s); end if;
 is_new:=s.stripe_subscription_id is distinct from p_subscription;
 if is_new then
   update public.job_report_deliveries set status='suppressed',last_error='Replaced subscription',claimed_until=null
   where subscriber_id=p_id and status='pending' and kind in ('report','initial','welcome');
 end if;
 update public.job_report_subscribers set stripe_customer_id=p_customer,stripe_subscription_id=p_subscription,
   subscription_created=p_created,status=p_status,paid_until=case when is_new then p_paid_until else coalesce(p_paid_until,paid_until) end,
   cancel_at_period_end=p_cancel,email=coalesce(nullif(lower(trim(p_email)),''),email),last_synced_at=now(),
   subscribed_at=case when p_paid_until is not null and (is_new or subscribed_at is null) then now() else subscribed_at end,
   unsubscribed_at=case when is_new and p_paid_until is not null then null else unsubscribed_at end,
   initial_prepared=case when is_new then false else initial_prepared end,
   initial_job_ids=case when is_new then '{}'::uuid[] else initial_job_ids end
 where id=p_id returning * into s;
 return to_jsonb(s);
end $$;

create function public.job_report_prepare(p_cutoff timestamptz,p_live boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare rid uuid; content jsonb; ids uuid[]; day date;
begin
 perform pg_advisory_xact_lock(hashtext('job-report-prepare'));
 day:=(p_cutoff at time zone 'America/New_York')::date;
 select id into rid from public.job_report_reports where report_date=day;
 if found then return rid; end if;
 select jsonb_agg(snapshot||jsonb_build_object('approvedAt',approved_at) order by approved_at,job_id),array_agg(job_id)
 into content,ids from (select * from public.job_report_approvals where report_id is null and not withdrawn and approved_at<=p_cutoff order by approved_at,job_id for update) q;
 if content is null then return null; end if;
 insert into public.job_report_reports(report_date,cutoff,jobs) values(day,p_cutoff,content) returning id into rid;
 update public.job_report_approvals set report_id=rid where job_id=any(ids);
 insert into public.job_report_deliveries(subscriber_id,report_id,message_key,kind,recipient,payload,livemode)
 select s.id,rid,'report:'||rid||':'||s.id,'report',s.email,jsonb_build_object('date',day,'jobs',filtered.jobs),p_live
 from public.job_report_subscribers s cross join lateral (
   select jsonb_agg(item) as jobs from jsonb_array_elements(content) item where not ((item->>'id')::uuid=any(s.initial_job_ids))
 ) filtered where s.livemode=p_live and s.subscribed_at<=p_cutoff and s.status in ('active','past_due') and s.paid_until>now()
 and s.unsubscribed_at is null and s.suppressed_at is null and not s.risk_hold and filtered.jobs is not null
 on conflict(message_key) do nothing;
 return rid;
end $$;

create function public.job_report_claim(p_live boolean,p_limit integer default 100)
returns setof public.job_report_deliveries language sql security invoker set search_path='' as $$
 with candidates as (
   select id from public.job_report_deliveries where livemode=p_live and status='pending' and next_attempt_at<=now()
   and (claimed_until is null or claimed_until<now()) order by created_at,id for update skip locked limit least(greatest(p_limit,1),100)
 ) update public.job_report_deliveries d set claimed_until=now()+interval '5 minutes'
 from candidates c where d.id=c.id returning d.*
$$;
-- First report: today's actual approved rows, never the entire approved inventory.
-- Existing review feedback supplies approvals made earlier on launch day.
create function public.job_report_initial(p_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.job_report_subscribers; content jsonb; day_start timestamptz;
begin
 select * into s from public.job_report_subscribers where id=p_id for update;
 if not found or s.initial_prepared or s.status not in ('active','past_due') or s.paid_until is null or s.paid_until<=now()
   or s.unsubscribed_at is not null or s.suppressed_at is not null or s.risk_hold then return false; end if;
 day_start:=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York';
 select jsonb_agg(job order by job->>'approvedAt',job->>'id') into content from (
   select distinct on (j.id) job_report_private.snapshot_job(j)||jsonb_build_object('approvedAt',coalesce(a.approved_at,f.created_at)) as job
   from public.jobs j left join public.job_report_approvals a on a.job_id=j.id
   left join public.job_review_feedback f on f.job_id=j.id and f.decision='approved'
   where j.is_approved is true and j.is_rejected is not true and coalesce(a.approved_at,f.created_at)>=day_start
   order by j.id
 ) q;
 update public.job_report_subscribers set initial_prepared=true,initial_job_ids=coalesce((select array_agg((x->>'id')::uuid) from jsonb_array_elements(content) x),'{}') where id=s.id;
 insert into public.job_report_deliveries(subscriber_id,message_key,kind,recipient,payload,livemode)
 values(s.id,'welcome:'||s.stripe_subscription_id,'welcome',s.email,'{}',s.livemode) on conflict(message_key) do nothing;
 if content is null then return false; end if;
 insert into public.job_report_deliveries(subscriber_id,message_key,kind,recipient,payload,livemode)
 values(s.id,'initial:'||s.stripe_subscription_id,'initial',s.email,jsonb_build_object('date',(now() at time zone 'America/New_York')::date,'jobs',content),s.livemode)
 on conflict(message_key) do nothing;
 return true;
end $$;
create function public.job_report_request_manage(p_email text,p_live boolean,p_hash text,p_link text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.job_report_subscribers;
begin
 select * into s from public.job_report_subscribers where email=lower(trim(p_email)) and livemode=p_live and stripe_customer_id is not null for update;
 if not found or s.manage_requested_at>now()-interval '5 minutes' then return false; end if;
 update public.job_report_subscribers set manage_requested_at=now() where id=s.id;
 insert into public.job_report_manage_tokens(token_hash,subscriber_id,expires_at) values(p_hash,s.id,now()+interval '1 hour');
 insert into public.job_report_deliveries(subscriber_id,message_key,kind,recipient,payload,livemode,expires_at)
 values(s.id,'manage:'||p_hash,'manage',s.email,jsonb_build_object('link',p_link),p_live,now()+interval '1 hour');
 return true;
end $$;
create function public.job_report_consume_manage(p_hash text)
returns uuid language sql security invoker set search_path='' as $$
 update public.job_report_manage_tokens set used_at=now() where token_hash=p_hash and used_at is null and expires_at>now() returning subscriber_id
$$;
create function public.job_report_claim_one(p_id uuid) returns boolean
language sql security invoker set search_path='' as $$
 with claimed as (update public.job_report_deliveries set claimed_until=now()+interval '5 minutes'
 where id=p_id and status='pending' and next_attempt_at<=now() and (claimed_until is null or claimed_until<now()) returning id)
 select exists(select 1 from claimed)
$$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname like 'job_report_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
