-- Run in a transaction and always ROLLBACK. No fixture or access grant survives.
do $$
<<ticketing_qa>>
declare
  coord_a uuid:=gen_random_uuid(); coord_b uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); operator_id uuid:=gen_random_uuid(); existing_member uuid:=gen_random_uuid();
  owner_id uuid:='a28ddac8-dc3a-4ae1-83f5-b675e7b85871';
  event_a uuid:=gen_random_uuid(); event_b uuid:=gen_random_uuid(); user_id uuid;
  a public.ticketing_events; b public.ticketing_events; invite_id uuid; assignment_id uuid; caught boolean;
  fixture_email text; target_email text; bucket_policy boolean; member_count bigint;
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
end $$;
