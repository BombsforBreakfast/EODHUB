-- Server-only billing audit and durable transactional email delivery.
alter table public.rental_properties add column billing_hold_until timestamptz;
alter table public.rental_properties add column renewal_consent_at timestamptz, add column renewal_consent_version text;
create table public.rental_subscription_history (
  subscription_id text primary key,
  property_id uuid not null references public.rental_properties(id),
  provider_id uuid not null references public.rental_providers(user_id),
  created_at timestamptz not null default now()
);
create index rental_subscription_history_property on public.rental_subscription_history(property_id);
create index rental_subscription_history_provider on public.rental_subscription_history(provider_id);
insert into public.rental_subscription_history(subscription_id,property_id,provider_id)
select stripe_subscription_id,id,provider_id from public.rental_properties where stripe_subscription_id is not null;
create table public.rental_billing_cases (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  property_id uuid not null references public.rental_properties(id),
  provider_id uuid not null references public.rental_providers(user_id),
  subscription_id text not null,
  kind text not null check(kind in ('payment_failed','payment_stopped','term_ended','refund','dispute','fraud_warning')),
  status text not null default 'open' check(status in ('open','resolved','expired')),
  opened_at timestamptz not null,
  deadline timestamptz not null,
  stripe_object_id text not null,
  detail text not null,
  note text,
  resolved_at timestamptz,
  reviewed_by uuid references auth.users(id)
);
create index rental_billing_cases_due on public.rental_billing_cases(status,deadline);
create index rental_billing_cases_property on public.rental_billing_cases(property_id,status);
create index rental_billing_cases_provider on public.rental_billing_cases(provider_id);
create table public.rental_billing_emails (
  id uuid primary key default gen_random_uuid(),
  message_key text not null unique,
  recipient text not null,
  subject text not null,
  message text not null,
  link text not null,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz
);
create index rental_billing_emails_due on public.rental_billing_emails(next_attempt_at) where sent_at is null;
alter table public.rental_billing_cases enable row level security;
alter table public.rental_billing_emails enable row level security;
alter table public.rental_subscription_history enable row level security;
revoke all on public.rental_billing_cases, public.rental_billing_emails, public.rental_subscription_history from public,anon,authenticated,eod_rental;
grant all on public.rental_billing_cases, public.rental_billing_emails, public.rental_subscription_history to service_role;

-- Lease a batch atomically; concurrent webhooks/cron cannot send the same row.
create function public.rental_claim_billing_emails(p_limit integer default 25)
returns setof public.rental_billing_emails language sql set search_path='' as $$
  update public.rental_billing_emails set attempts=attempts+1,next_attempt_at=now()+interval '15 minutes'
  where id in (select id from public.rental_billing_emails where sent_at is null and next_attempt_at<=now()
    order by next_attempt_at,id for update skip locked limit least(greatest(p_limit,1),50)) returning *;
$$;
create function public.rental_refresh_billing_hold(p_property uuid) returns void
language sql set search_path='' as $$
  update public.rental_properties set billing_hold_until=(
    select min(deadline) from public.rental_billing_cases where property_id=p_property and status<>'resolved'
  ) where id=p_property;
$$;
revoke all on function public.rental_claim_billing_emails(integer),public.rental_refresh_billing_hold(uuid) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_claim_billing_emails(integer),public.rental_refresh_billing_hold(uuid) to service_role;

create or replace function public.rental_record_metric(p_id uuid,p_kind text) returns void
language sql set search_path='' as $$
  insert into public.rental_property_metrics(property_id,day,views,contacts)
  select id,current_date,case when p_kind='view' then 1 else 0 end,case when p_kind='contact' then 1 else 0 end
  from public.rental_properties p where p.id=p_id and p.published is not null and not p.hidden
  and (p.paid_until>now() or (p.paid_until is not null and p.grace_until>now()))
  and (p.billing_hold_until is null or p.billing_hold_until>now())
  and exists(select 1 from public.rental_providers r where r.user_id=p.provider_id and r.status='approved')
  on conflict(property_id,day) do update set views=rental_property_metrics.views+excluded.views,contacts=rental_property_metrics.contacts+excluded.contacts;
$$;
