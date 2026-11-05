-- No-card pilot only. These records never represent paid orders or Stripe fees.
alter table public.ticketing_events add column no_card_pilot_enabled boolean not null default false;
alter table public.ticketing_events add constraint ticketing_no_card_requires_approval
  check(not no_card_pilot_enabled or (environment='pilot' and review_status='approved' and event is not null));

create table public.ticketing_pilot_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.ticketing_accounts(user_id) on delete cascade,
  event_id uuid not null references public.ticketing_events(id),
  request_id uuid not null,
  ticket_type_id text not null check(length(ticket_type_id) between 1 and 100),
  ticket_type_name text not null check(length(ticket_type_name) between 1 and 100),
  quantity integer not null check(quantity between 1 and 8),
  event_snapshot jsonb not null check(jsonb_typeof(event_snapshot)='object'),
  regular_subtotal_cents integer not null check(regular_subtotal_cents>=0),
  regular_hub_fee_cents integer not null check(regular_hub_fee_cents>=0),
  amount_collected_cents integer not null default 0 check(amount_collected_cents=0),
  hub_fee_cents integer not null default 0 check(hub_fee_cents=0),
  processing_fee_cents integer not null default 0 check(processing_fee_cents=0),
  payment_mode text not null default 'no_card_pilot' check(payment_mode='no_card_pilot'),
  created_at timestamptz not null default now(),
  unique(buyer_id,request_id)
);
create index ticketing_pilot_orders_buyer on public.ticketing_pilot_orders(buyer_id,created_at desc);
create table public.ticketing_pilot_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.ticketing_pilot_orders(id) on delete cascade,
  event_id uuid not null references public.ticketing_events(id),
  ticket_type_id text not null,
  qr_token text not null unique check(qr_token ~ '^[A-Za-z0-9_-]{43}$'),
  manual_code text not null unique check(manual_code ~ '^[2-9A-HJ-NP-Z]{8}$'),
  created_at timestamptz not null default now()
);
create index ticketing_pilot_tickets_inventory on public.ticketing_pilot_tickets(event_id,ticket_type_id);
create index ticketing_pilot_tickets_order on public.ticketing_pilot_tickets(order_id);

alter table public.ticketing_pilot_orders enable row level security;
alter table public.ticketing_pilot_tickets enable row level security;
revoke all on public.ticketing_pilot_orders,public.ticketing_pilot_tickets from public,anon,authenticated,eod_rental,eod_ticketing;
grant select,insert,update,delete on public.ticketing_pilot_orders,public.ticketing_pilot_tickets to service_role;

create function ticketing_private.close_no_card_on_review_change() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if new.review_status<>'approved' then new.no_card_pilot_enabled:=false; end if;
  return new;
end $$;
create trigger close_no_card_on_review_change before update on public.ticketing_events
for each row execute function ticketing_private.close_no_card_on_review_change();
revoke all on function ticketing_private.close_no_card_on_review_change() from public,anon,authenticated,eod_rental,eod_ticketing;

create function public.ticketing_set_no_card_pilot(p_actor uuid,p_event uuid,p_expected integer,p_enabled boolean) returns integer
language plpgsql security invoker set search_path='' as $$ declare r public.ticketing_events; begin
  if not public.ticketing_is_admin(p_actor) then raise exception 'Owner access required' using errcode='42501'; end if;
  select * into r from public.ticketing_events where id=p_event for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if p_expected is null or p_expected<>r.revision then raise exception 'Reload the event' using errcode='PT409'; end if;
  if p_enabled is null or (p_enabled and (r.environment<>'pilot' or r.review_status<>'approved' or r.event is null)) then
    raise exception 'Approve this pilot event first' using errcode='PT409'; end if;
  update public.ticketing_events set no_card_pilot_enabled=p_enabled,revision=revision+1,updated_at=now() where id=p_event returning revision into p_expected;
  insert into public.ticketing_audit(event_id,actor_id,action,details)
    values(p_event,p_actor,case when p_enabled then 'no_card_pilot_enabled' else 'no_card_pilot_disabled' end,'{}');
  return p_expected;
end $$;

-- One event lock covers both its switch and all inventory claims. Retries return
-- the original order even after the owner closes the pilot, without new tickets.
create function public.ticketing_issue_pilot_order(p_actor uuid,p_event uuid,p_type text,p_quantity integer,p_request uuid,p_tickets jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare r public.ticketing_events; previous public.ticketing_pilot_orders; ticket_type jsonb; ticket jsonb; types jsonb;
  order_id uuid; price integer; capacity integer; sold integer; total_sold integer; closes timestamptz;
begin
  if not exists(select 1 from public.ticketing_accounts where user_id=p_actor and active) then raise exception 'Account unavailable' using errcode='42501'; end if;
  if p_request is null or p_quantity is null or p_quantity not between 1 and 8 or p_type is null or length(p_type) not between 1 and 100 then
    raise exception 'Invalid ticket selection' using errcode='22023'; end if;
  select * into r from public.ticketing_events where id=p_event for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  select * into previous from public.ticketing_pilot_orders where buyer_id=p_actor and request_id=p_request;
  if found then
    if previous.event_id<>p_event or previous.ticket_type_id<>p_type or previous.quantity<>p_quantity then
      raise exception 'This request already has another order' using errcode='PT409'; end if;
    return previous.id;
  end if;
  if not r.no_card_pilot_enabled or r.environment<>'pilot' or r.review_status<>'approved' or r.event is null then
    raise exception 'No-card pilot is closed' using errcode='PT409'; end if;
  closes:=coalesce(nullif(r.event->>'endsAt','')::timestamptz,nullif(r.event->>'startsAt','')::timestamptz);
  if closes is null or closes<=now() then raise exception 'This event has ended' using errcode='PT409'; end if;
  types:=case when jsonb_typeof(r.event->'ticketTypes')='array' and jsonb_array_length(r.event->'ticketTypes')>0 then r.event->'ticketTypes'
    else jsonb_build_array(jsonb_build_object('id','general','name','General admission','priceCents',r.event->'priceCents','capacity',r.event->'capacity')) end;
  select value into ticket_type from jsonb_array_elements(types) where value->>'id'=p_type;
  if not found then raise exception 'Invalid ticket type' using errcode='22023'; end if;
  price:=(ticket_type->>'priceCents')::integer; capacity:=(ticket_type->>'capacity')::integer;
  if price is null or price not between 0 and 1000000 or capacity is null or capacity not between 0 and 100000 then
    raise exception 'Invalid event inventory' using errcode='22023'; end if;
  select count(*) into sold from public.ticketing_pilot_tickets where event_id=p_event and ticket_type_id=p_type;
  select count(*) into total_sold from public.ticketing_pilot_tickets where event_id=p_event;
  if sold+p_quantity>capacity or total_sold+p_quantity>(r.event->>'capacity')::integer then
    raise exception 'Not enough tickets remain' using errcode='PT409'; end if;
  if jsonb_typeof(p_tickets) is distinct from 'array' or jsonb_array_length(p_tickets)<>p_quantity then
    raise exception 'Invalid ticket issuance' using errcode='22023'; end if;
  insert into public.ticketing_pilot_orders(buyer_id,event_id,request_id,ticket_type_id,ticket_type_name,quantity,event_snapshot,regular_subtotal_cents,regular_hub_fee_cents)
    values(p_actor,p_event,p_request,p_type,ticket_type->>'name',p_quantity,r.event,price*p_quantity,
      case when price=0 then 0 else (100+round(price::numeric*0.02)::integer)*p_quantity end)
    returning id into order_id;
  for ticket in select value from jsonb_array_elements(p_tickets) loop
    if coalesce(ticket->>'qr','') !~ '^[A-Za-z0-9_-]{43}$' or coalesce(ticket->>'manual','') !~ '^[2-9A-HJ-NP-Z]{8}$' then
      raise exception 'Invalid ticket identifiers' using errcode='22023'; end if;
    insert into public.ticketing_pilot_tickets(order_id,event_id,ticket_type_id,qr_token,manual_code)
      values(order_id,p_event,p_type,ticket->>'qr',ticket->>'manual');
  end loop;
  insert into public.ticketing_audit(event_id,actor_id,action,details)
    values(p_event,p_actor,'pilot_tickets_issued',jsonb_build_object('order_id',order_id,'quantity',p_quantity,'amount_collected_cents',0));
  return order_id;
end $$;

create function public.ticketing_pilot_inventory(p_events uuid[]) returns table(event_id uuid,counts jsonb,total bigint)
language sql stable security invoker set search_path='' as $$
  select c.event_id,jsonb_object_agg(c.ticket_type_id,c.issued),sum(c.issued)::bigint
  from (select t.event_id,t.ticket_type_id,count(*) as issued from public.ticketing_pilot_tickets t
    where t.event_id=any(p_events) group by t.event_id,t.ticket_type_id) c group by c.event_id
$$;

revoke all on function public.ticketing_set_no_card_pilot(uuid,uuid,integer,boolean),public.ticketing_issue_pilot_order(uuid,uuid,text,integer,uuid,jsonb),public.ticketing_pilot_inventory(uuid[])
  from public,anon,authenticated,eod_rental,eod_ticketing;
grant execute on function public.ticketing_set_no_card_pilot(uuid,uuid,integer,boolean),public.ticketing_issue_pilot_order(uuid,uuid,text,integer,uuid,jsonb),public.ticketing_pilot_inventory(uuid[]) to service_role;
do $$ begin
  if exists(select 1 from pg_roles where rolname='eod_portal') then
    revoke all on public.ticketing_pilot_orders,public.ticketing_pilot_tickets from eod_portal;
    revoke all on function public.ticketing_set_no_card_pilot(uuid,uuid,integer,boolean),public.ticketing_issue_pilot_order(uuid,uuid,text,integer,uuid,jsonb),public.ticketing_pilot_inventory(uuid[]) from eod_portal;
  end if;
end $$;
