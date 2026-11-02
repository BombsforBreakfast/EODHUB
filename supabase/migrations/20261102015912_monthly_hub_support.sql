-- Voluntary support only. No membership, Auth, Rentals or entitlement changes.
alter table public.hub_contributions
  add column frequency text not null default 'one_time' check(frequency in('one_time','monthly')),
  add column stripe_invoice_id text unique,
  add column support_subscription_id uuid,
  add column disputed_cents integer not null default 0 check(disputed_cents>=0 and disputed_cents<=amount_cents),
  add column dispute_won boolean not null default false;

create table public.hub_support_subscriptions(
  id uuid primary key references public.hub_contributions(id),
  amount_cents integer not null check(amount_cents between 100 and 50000),
  livemode boolean not null,
  stripe_subscription_id text unique,
  stripe_customer_id text unique,
  stripe_product_id text not null,
  email_hash text check(email_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in('pending','incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.hub_contributions add constraint hub_support_subscription_fk
  foreign key(support_subscription_id) references public.hub_support_subscriptions(id);
create index hub_support_email_lookup on public.hub_support_subscriptions(email_hash,livemode) where stripe_customer_id is not null;
create index hub_support_subscription_payments on public.hub_contributions(support_subscription_id,paid_at desc) where support_subscription_id is not null;

create table public.hub_support_billing_emails(
  id uuid primary key default gen_random_uuid(), message_key text unique not null,
  recipient text not null, subject text not null, message text not null, link text not null,
  livemode boolean not null, created_at timestamptz not null default now(),
  sent_at timestamptz, claimed_until timestamptz, attempts integer not null default 0
);
create index hub_support_unsent_mail on public.hub_support_billing_emails(livemode,created_at) where sent_at is null;
create table public.hub_support_billing_issues(
  incident_key text primary key, support_subscription_id uuid not null references public.hub_support_subscriptions(id),
  kind text not null check(kind in('payment_failed','refund','dispute','fraud_warning')),
  stripe_object_id text not null, detail text not null,
  status text not null default 'open' check(status in('open','resolved')),
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index hub_support_open_issues on public.hub_support_billing_issues(created_at desc) where status='open';

alter table public.hub_support_subscriptions enable row level security;
alter table public.hub_support_billing_emails enable row level security;
alter table public.hub_support_billing_issues enable row level security;
revoke all on public.hub_support_subscriptions,public.hub_support_billing_emails,public.hub_support_billing_issues from public,anon,authenticated,eod_rental;
grant all on public.hub_support_subscriptions,public.hub_support_billing_emails,public.hub_support_billing_issues to service_role;

create function public.reserve_hub_support_v2(p_id uuid,p_amount integer,p_live boolean,p_source text,p_frequency text,p_product text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.hub_contributions; result jsonb;
begin
  if p_frequency not in('one_time','monthly') then raise exception 'Invalid frequency';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into r from public.hub_contributions where id=p_id;
  if found then
    if r.amount_cents<>p_amount or r.livemode<>p_live or r.frequency<>p_frequency then return jsonb_build_object('error','conflict');end if;
    return to_jsonb(r);
  end if;
  result=public.reserve_hub_support(p_id,p_amount,p_live,p_source);
  if result ? 'error' then return result;end if;
  if p_frequency='monthly' then
    if p_product is null or p_product !~ '^prod_' then raise exception 'Monthly support product unavailable';end if;
    insert into public.hub_support_subscriptions(id,amount_cents,livemode,stripe_product_id) values(p_id,p_amount,p_live,p_product);
    update public.hub_contributions set frequency='monthly',support_subscription_id=p_id where id=p_id returning * into r;
    return to_jsonb(r);
  end if;
  return result;
end;$$;

create function public.sync_hub_support_subscription(p_id uuid,p_live boolean,p_subscription text,p_customer text,p_email_hash text,p_status text,p_period_end timestamptz,p_cancel boolean,p_event_created bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.hub_support_subscriptions;
begin
  select * into r from public.hub_support_subscriptions where id=p_id for update;
  if not found or r.livemode<>p_live or (r.stripe_subscription_id is not null and r.stripe_subscription_id<>p_subscription) or (r.stripe_customer_id is not null and r.stripe_customer_id<>p_customer) or p_subscription !~ '^sub_' or p_customer !~ '^cus_' then raise exception 'Support subscription mismatch';end if;
  if p_event_created<r.last_event_created then return to_jsonb(r);end if;
  update public.hub_support_subscriptions set stripe_subscription_id=p_subscription,stripe_customer_id=p_customer,
    email_hash=p_email_hash,status=p_status,current_period_end=p_period_end,cancel_at_period_end=p_cancel,
    last_event_created=p_event_created,updated_at=now() where id=p_id returning * into r;
  return to_jsonb(r);
end;$$;

-- One row per Stripe invoice, including the first invoice. Checkout is not a payment.
create function public.record_hub_support_invoice(p_event text,p_id uuid,p_live boolean,p_invoice text,p_intent text,p_amount integer,p_first boolean,p_kind text,p_refunded integer default 0,p_disputed integer default null,p_paid_at timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.hub_support_subscriptions; r public.hub_contributions; notification jsonb; applied text;
begin
  select * into s from public.hub_support_subscriptions where id=p_id for update;
  if not found or s.livemode<>p_live or s.amount_cents<>p_amount or s.stripe_subscription_id is null or p_invoice !~ '^in_' or p_kind not in('paid','failed','refund','dispute','dispute_won') then raise exception 'Support invoice mismatch';end if;
  select * into r from public.hub_contributions where stripe_invoice_id=p_invoice for update;
  if found then
    if r.support_subscription_id<>p_id or r.livemode<>p_live or r.amount_cents<>p_amount then raise exception 'Invoice ownership mismatch';end if;
  elsif p_first then
    select * into r from public.hub_contributions where id=p_id for update;
    if r.stripe_invoice_id is not null and r.stripe_invoice_id<>p_invoice then raise exception 'First invoice mismatch';end if;
    update public.hub_contributions set stripe_invoice_id=p_invoice where id=r.id returning * into r;
  else
    insert into public.hub_contributions(id,amount_cents,livemode,frequency,support_subscription_id,stripe_invoice_id)
      values(gen_random_uuid(),p_amount,p_live,'monthly',p_id,p_invoice) returning * into r;
  end if;
  if p_kind in('paid','refund') then
    notification=public.apply_hub_support_event(p_event,r.id,p_live,p_kind,p_amount,p_intent,null,p_refunded);
    if p_paid_at is not null then
      update public.hub_contributions set paid_at=least(paid_at,p_paid_at) where id=r.id;
    end if;
  else
    insert into public.hub_support_events(event_id) values(p_event) on conflict do nothing returning event_id into applied;
    if applied is not null and p_kind in('dispute','dispute_won') then
      if p_disputed is null or p_disputed<0 or p_disputed>p_amount then raise exception 'Invalid dispute amount';end if;
      update public.hub_contributions set disputed_cents=case when p_kind='dispute_won' or dispute_won then 0 else greatest(disputed_cents,p_disputed) end,
        dispute_won=dispute_won or p_kind='dispute_won' where id=r.id;
    end if;
  end if;
  select * into r from public.hub_contributions where id=r.id;
  return jsonb_build_object('contribution',to_jsonb(r),'notification',notification);
end;$$;

create function public.hub_support_management_quota(p_email text,p_source text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare emails integer; sources integer;
begin
  if p_email !~ '^[a-f0-9]{64}$' or p_source !~ '^[a-f0-9]{64}$' then raise exception 'Invalid quota key';end if;
  insert into public.hub_support_rate_limits values(p_email,date_trunc('hour',now()),1)
    on conflict(source_key,window_at) do update set attempts=public.hub_support_rate_limits.attempts+1 returning attempts into emails;
  insert into public.hub_support_rate_limits values(p_source,date_trunc('hour',now()),1)
    on conflict(source_key,window_at) do update set attempts=public.hub_support_rate_limits.attempts+1 returning attempts into sources;
  delete from public.hub_support_rate_limits where window_at<now()-interval '2 days';
  return emails<=3 and sources<=10;
end;$$;
create function public.hub_support_claim_emails(p_live boolean)
returns setof public.hub_support_billing_emails language sql security invoker set search_path='' as $$
  update public.hub_support_billing_emails set claimed_until=now()+interval '5 minutes',attempts=attempts+1 where id in(
    select id from public.hub_support_billing_emails where livemode=p_live and sent_at is null and (claimed_until is null or claimed_until<now())
    order by created_at limit 25 for update skip locked
  ) returning *;
$$;
revoke all on function public.reserve_hub_support_v2(uuid,integer,boolean,text,text,text),public.sync_hub_support_subscription(uuid,boolean,text,text,text,text,timestamptz,boolean,bigint),public.record_hub_support_invoice(text,uuid,boolean,text,text,integer,boolean,text,integer,integer,timestamptz),public.hub_support_management_quota(text,text),public.hub_support_claim_emails(boolean) from public,anon,authenticated,eod_rental;
grant execute on function public.reserve_hub_support_v2(uuid,integer,boolean,text,text,text),public.sync_hub_support_subscription(uuid,boolean,text,text,text,text,timestamptz,boolean,bigint),public.record_hub_support_invoice(text,uuid,boolean,text,text,integer,boolean,text,integer,integer,timestamptz),public.hub_support_management_quota(text,text),public.hub_support_claim_emails(boolean) to service_role;
