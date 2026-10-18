-- Voluntary support is independent of profiles, membership, and advertising.
begin;
create table public.hub_contributions (
  id uuid primary key,
  amount_cents integer not null check (amount_cents between 100 and 50000),
  currency text not null default 'usd' check (currency = 'usd'),
  livemode boolean not null,
  status text not null default 'pending' check (status in ('pending','paid','expired','partially_refunded','refunded')),
  checkout_session_id text unique,
  payment_intent_id text unique,
  refunded_cents integer not null default 0 check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create table public.hub_support_events (event_id text primary key, created_at timestamptz not null default now());
create table public.hub_support_rate_limits (source_key text not null, window_at timestamptz not null, attempts integer not null, primary key(source_key,window_at));
alter table public.hub_contributions enable row level security;
alter table public.hub_support_events enable row level security;
alter table public.hub_support_rate_limits enable row level security;
revoke all on public.hub_contributions, public.hub_support_events, public.hub_support_rate_limits from public, anon, authenticated;
grant all on public.hub_contributions, public.hub_support_events, public.hub_support_rate_limits to service_role;

create function public.reserve_hub_support(p_id uuid, p_amount integer, p_live boolean, p_source text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.hub_contributions; n integer;
begin
  if p_amount not between 100 and 50000 or p_source !~ '^[a-f0-9]{64}$' then raise exception 'Invalid contribution'; end if;
  -- Concurrent browser retries share the same record and Stripe idempotency key.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into r from public.hub_contributions where id=p_id;
  if found then
    if r.amount_cents <> p_amount or r.livemode <> p_live then return jsonb_build_object('error','conflict'); end if;
    return to_jsonb(r);
  end if;
  delete from public.hub_support_rate_limits where window_at < now() - interval '2 days';
  insert into public.hub_support_rate_limits(source_key,window_at,attempts) values(p_source,date_trunc('hour',now()),1)
  on conflict(source_key,window_at) do update set attempts=public.hub_support_rate_limits.attempts+1 returning attempts into n;
  if n > 10 then return jsonb_build_object('error','rate_limit'); end if;
  insert into public.hub_contributions(id,amount_cents,livemode) values(p_id,p_amount,p_live) returning * into r;
  return to_jsonb(r);
end $$;

create function public.apply_hub_support_event(p_event text, p_id uuid, p_live boolean, p_kind text, p_amount integer, p_intent text, p_session text, p_refunded integer default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.hub_contributions; inserted integer;
begin
  select * into r from public.hub_contributions where id=p_id for update;
  if not found or r.livemode <> p_live or r.amount_cents <> p_amount then raise exception 'Contribution mismatch'; end if;
  if p_kind not in ('paid','expired','refund') then raise exception 'Invalid event kind'; end if;
  if p_session is not null and r.checkout_session_id is not null and p_session <> r.checkout_session_id then raise exception 'Session mismatch'; end if;
  if p_intent is not null and r.payment_intent_id is not null and p_intent <> r.payment_intent_id then raise exception 'Intent mismatch'; end if;
  insert into public.hub_support_events(event_id) values(p_event) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  update public.hub_contributions set
    checkout_session_id=coalesce(checkout_session_id,p_session),
    payment_intent_id=coalesce(payment_intent_id,p_intent),
    refunded_cents=greatest(refunded_cents,case when p_kind='refund' then p_refunded else 0 end),
    paid_at=case when p_kind in ('paid','refund') then coalesce(paid_at,now()) else paid_at end,
    status=case
      when greatest(refunded_cents,case when p_kind='refund' then p_refunded else 0 end) >= amount_cents then 'refunded'
      when greatest(refunded_cents,case when p_kind='refund' then p_refunded else 0 end) > 0 then 'partially_refunded'
      when p_kind='paid' or paid_at is not null then 'paid'
      when p_kind='expired' then 'expired' else status end
  where id=p_id;
end $$;
revoke all on function public.reserve_hub_support(uuid,integer,boolean,text) from public, anon, authenticated;
revoke all on function public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_hub_support(uuid,integer,boolean,text) to service_role;
grant execute on function public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer) to service_role;
commit;
