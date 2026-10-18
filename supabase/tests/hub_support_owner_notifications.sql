-- Run in the SQL editor after the owner-alert migration. All test rows and bell
-- items roll back, so no fake contribution or real notification is published.
begin;
do $$
declare
  live_id uuid := gen_random_uuid();
  test_id uuid := gen_random_uuid();
  expired_id uuid := gen_random_uuid();
  reordered_id uuid := gen_random_uuid();
  result jsonb;
  notification uuid;
  total integer;
begin
  insert into public.hub_contributions(id,amount_cents,livemode)
    values(live_id,325,true),(test_id,325,false),(expired_id,325,true),(reordered_id,500,true);
  result := public.apply_hub_support_event('evt_verify_'||live_id,live_id,true,'paid',325,'pi_verify_'||live_id,'cs_verify_'||live_id,0);
  notification := (result->>'notification_id')::uuid;
  if notification is null then raise exception 'Confirmed live payment did not create owner notification'; end if;
  if not exists (
    select 1 from public.notifications where id=notification
      and recipient_user_id='a28ddac8-dc3a-4ae1-83f5-b675e7b85871'
      and user_id=recipient_user_id and actor_user_id is null
      and type='hub_contribution' and link='/admin/hub-support'
      and message like '%$3.25%'
  ) then raise exception 'Owner notification recipient or content mismatch'; end if;
  result := public.apply_hub_support_event('evt_verify_'||live_id,live_id,true,'paid',325,'pi_verify_'||live_id,'cs_verify_'||live_id,0);
  if result->>'notification_id' is not null then raise exception 'Repeated event requested duplicate push'; end if;
  result := public.apply_hub_support_event('evt_verify_later_'||live_id,live_id,true,'paid',325,'pi_verify_'||live_id,'cs_verify_'||live_id,0);
  if result->>'notification_id' is not null then raise exception 'Second paid event requested duplicate push'; end if;
  update public.notifications set archived_at=now() where id=notification;
  result := public.apply_hub_support_event('evt_verify_archive_'||live_id,live_id,true,'paid',325,'pi_verify_'||live_id,'cs_verify_'||live_id,0);
  if result->>'notification_id' is not null then raise exception 'Archived bell item created another notification'; end if;
  select count(*) into total from public.notifications where type='hub_contribution' and entity_id=live_id;
  if total <> 1 then raise exception 'Contribution notification was duplicated'; end if;

  result := public.apply_hub_support_event('evt_verify_'||test_id,test_id,false,'paid',325,null,null,0);
  if result->>'notification_id' is not null then raise exception 'Sandbox payment notified the owner'; end if;
  result := public.apply_hub_support_event('evt_verify_'||expired_id,expired_id,true,'expired',325,null,null,0);
  if result->>'notification_id' is not null then raise exception 'Expired checkout notified the owner'; end if;
  select count(*) into total from public.notifications where type='hub_contribution' and entity_id in(test_id,expired_id);
  if total <> 0 then raise exception 'Non-contribution events created notifications'; end if;

  result := public.apply_hub_support_event('evt_verify_refund_'||reordered_id,reordered_id,true,'refund',500,'pi_verify_'||reordered_id,null,100);
  if result->>'notification_id' is not null then raise exception 'Refund alone created a paid notification'; end if;
  result := public.apply_hub_support_event('evt_verify_paid_'||reordered_id,reordered_id,true,'paid',500,'pi_verify_'||reordered_id,'cs_verify_'||reordered_id,0);
  if result->>'notification_id' is null or result->>'message' not like '%$1.00 has been refunded.%' then
    raise exception 'Out-of-order refund was missing from owner notification';
  end if;
  if not exists(select 1 from public.hub_contributions where id=reordered_id and status='partially_refunded' and refunded_cents=100) then
    raise exception 'Late payment regressed refund state';
  end if;
  if has_function_privilege('anon','public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer)','execute') or
     has_function_privilege('authenticated','public.apply_hub_support_event(text,uuid,boolean,text,integer,text,text,integer)','execute') then
    raise exception 'Untrusted caller can apply payment events';
  end if;
end $$;
rollback;
select 'PASS: owner-only live alerts, retry/archive deduplication, sandbox suppression, refund ordering and RPC privacy; all test data rolled back' as result;
