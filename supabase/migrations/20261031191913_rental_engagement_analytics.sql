-- Aggregate engagement only: no visitor identifiers, addresses, emails, or IPs.
create table public.rental_engagement_daily (
  subject_type text not null check (subject_type in ('property','advertiser')),
  subject_id text not null,
  owner_id text not null,
  day date not null,
  impressions bigint not null default 0 check (impressions >= 0),
  property_opens bigint not null default 0 check (property_opens >= 0),
  contact_opens bigint not null default 0 check (contact_opens >= 0),
  email_copies bigint not null default 0 check (email_copies >= 0),
  phone_clicks bigint not null default 0 check (phone_clicks >= 0),
  application_clicks bigint not null default 0 check (application_clicks >= 0),
  ad_clicks bigint not null default 0 check (ad_clicks >= 0),
  primary key (subject_type,subject_id,day)
);
create index rental_engagement_owner_day on public.rental_engagement_daily(owner_id,day);
create table public.rental_engagement_receipts (
  event_id uuid primary key,
  received_at timestamptz not null default now()
);
create index rental_engagement_receipt_age on public.rental_engagement_receipts(received_at);
alter table public.rental_engagement_daily enable row level security;
alter table public.rental_engagement_receipts enable row level security;
revoke all on public.rental_engagement_daily,public.rental_engagement_receipts from public,anon,authenticated,eod_rental;
grant select,insert,update on public.rental_engagement_daily to service_role;
grant select,insert,delete on public.rental_engagement_receipts to service_role;

-- Preserve the original portal counters; photo and direct-contact events start now.
insert into public.rental_engagement_daily(subject_type,subject_id,owner_id,day,impressions,contact_opens)
select 'property',m.property_id::text,p.provider_id::text,m.day,m.views,m.contacts
from public.rental_property_metrics m join public.rental_properties p on p.id=m.property_id;

create function public.rental_record_engagement(p_subject text,p_id text,p_owner text,p_kind text,p_event uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare accepted integer; utc_day date := (now() at time zone 'UTC')::date;
begin
  if p_event is null or p_subject is null or p_kind is null or p_id is null or p_owner is null or length(p_id)=0 or length(p_owner)=0 or length(p_id)>100 or length(p_owner)>100 then raise exception 'Invalid engagement'; end if;
  if p_subject='advertiser' then
    if p_id<>'eod_home_buying' or p_owner<>'eod_home_buying' or p_kind not in ('impression','ad_click') then raise exception 'Invalid advertiser event'; end if;
  elsif p_subject='property' then
    if p_kind not in ('impression','property_open','contact_open','email_copy','phone_click','application_click') then raise exception 'Invalid property event'; end if;
    if p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and not exists (
      select 1 from public.rental_properties p join public.rental_providers r on r.user_id=p.provider_id
      where p.id=p_id::uuid and p.provider_id::text=p_owner and p.published is not null and not p.hidden and r.status='approved'
      and (p.paid_until>now() or p.grace_until>now()) and (p.billing_hold_until is null or p.billing_hold_until>now())
    ) then return; end if;
  else raise exception 'Invalid subject'; end if;
  delete from public.rental_engagement_receipts where received_at < now()-interval '7 days';
  insert into public.rental_engagement_receipts(event_id) values(p_event) on conflict do nothing;
  get diagnostics accepted = row_count;
  if accepted=0 then return; end if;
  insert into public.rental_engagement_daily(subject_type,subject_id,owner_id,day,impressions,property_opens,contact_opens,email_copies,phone_clicks,application_clicks,ad_clicks)
  values(p_subject,p_id,p_owner,utc_day,(p_kind='impression')::int,(p_kind='property_open')::int,(p_kind='contact_open')::int,(p_kind='email_copy')::int,(p_kind='phone_click')::int,(p_kind='application_click')::int,(p_kind='ad_click')::int)
  on conflict(subject_type,subject_id,day) do update set
    impressions=rental_engagement_daily.impressions+excluded.impressions,
    property_opens=rental_engagement_daily.property_opens+excluded.property_opens,
    contact_opens=rental_engagement_daily.contact_opens+excluded.contact_opens,
    email_copies=rental_engagement_daily.email_copies+excluded.email_copies,
    phone_clicks=rental_engagement_daily.phone_clicks+excluded.phone_clicks,
    application_clicks=rental_engagement_daily.application_clicks+excluded.application_clicks,
    ad_clicks=rental_engagement_daily.ad_clicks+excluded.ad_clicks;
  -- Keep existing portal summary cards compatible during rollout.
  if p_subject='property' and p_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and p_kind in ('impression','contact_open') then
    insert into public.rental_property_metrics(property_id,day,views,contacts) values(p_id::uuid,utc_day,(p_kind='impression')::int,(p_kind='contact_open')::int)
    on conflict(property_id,day) do update set views=rental_property_metrics.views+excluded.views,contacts=rental_property_metrics.contacts+excluded.contacts;
  end if;
end;
$$;
revoke all on function public.rental_record_engagement(text,text,text,text,uuid) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_record_engagement(text,text,text,text,uuid) to service_role;

-- Bridge the old writer during deployment and for older browser bundles, so
-- impressions/contacts recorded after the backfill never fall between reports.
create or replace function public.rental_record_metric(p_id uuid,p_kind text) returns void
language plpgsql security invoker set search_path='' as $$
declare owner_id text;
begin
  if p_kind is null or p_kind not in ('view','contact') then return; end if;
  select p.provider_id::text into owner_id from public.rental_properties p where p.id=p_id;
  if owner_id is null then return; end if;
  perform public.rental_record_engagement('property',p_id::text,owner_id,case when p_kind='view' then 'impression' else 'contact_open' end,gen_random_uuid());
end;
$$;
revoke all on function public.rental_record_metric(uuid,text) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_record_metric(uuid,text) to service_role;
