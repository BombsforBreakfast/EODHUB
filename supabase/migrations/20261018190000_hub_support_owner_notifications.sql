-- One owner-only bell notification per confirmed live contribution. The event,
-- payment state and notification commit together; test payments never notify.
begin;

alter table public.hub_contributions add column notification_id uuid;

-- Existing callers ignore the result. The webhook now uses it to dispatch push
-- only when this transaction created the notification, including across retries.
drop function public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer);
create function public.apply_hub_support_event(p_event text, p_id uuid, p_live boolean, p_kind text, p_amount integer, p_intent text, p_session text, p_refunded integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.hub_contributions;
  n public.notifications;
  inserted integer;
  notification_message text;
  owner_id constant uuid := 'a28ddac8-dc3a-4ae1-83f5-b675e7b85871';
begin
  select * into r from public.hub_contributions where id=p_id for update;
  if not found or r.livemode <> p_live or r.amount_cents <> p_amount then raise exception 'Contribution mismatch'; end if;
  if p_kind not in ('paid','expired','refund') then raise exception 'Invalid event kind'; end if;
  if p_session is not null and r.checkout_session_id is not null and p_session <> r.checkout_session_id then raise exception 'Session mismatch'; end if;
  if p_intent is not null and r.payment_intent_id is not null and p_intent <> r.payment_intent_id then raise exception 'Intent mismatch'; end if;
  insert into public.hub_support_events(event_id) values(p_event) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return jsonb_build_object('notification_id',null); end if;
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
  where id=p_id returning * into r;

  if p_live and p_kind='paid' and r.notification_id is null then
    if not exists (
      select 1 from public.profiles p join auth.users u on u.id=p.user_id
      where p.user_id=owner_id and p.is_admin=true
        and lower(p.email)='micheal.p.twigg@gmail.com'
        and lower(u.email)='micheal.p.twigg@gmail.com'
    ) then raise exception 'Support owner unavailable'; end if;
    notification_message := 'A $' || to_char(r.amount_cents::numeric/100,'FM999990.00') || ' contribution to EOD-HUB was confirmed.';
    if r.refunded_cents > 0 then
      notification_message := notification_message || ' $' || to_char(r.refunded_cents::numeric/100,'FM999990.00') || ' has been refunded.';
    end if;
    n := public.create_notification(
      p_recipient_user_id=>owner_id, p_type=>'hub_contribution', p_category=>'system',
      p_entity_type=>'hub_contribution', p_entity_id=>r.id,
      p_actor_name=>'Support the Hub', p_title=>'New Hub contribution',
      p_message=>notification_message, p_link=>'/admin/hub-support',
      p_group_key=>'hub-support:' || r.id::text, p_dedupe_key=>'hub-support:' || r.id::text,
      p_metadata=>jsonb_build_object('contribution_id',r.id,'amount_cents',r.amount_cents)
    );
    update public.hub_contributions set notification_id=n.id where id=r.id;
    return jsonb_build_object('notification_id',n.id,'message',notification_message);
  end if;
  return jsonb_build_object('notification_id',null);
end $$;

revoke all on function public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer) from public,anon,authenticated;
grant execute on function public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer) to service_role;
commit;
