-- Run after the shared-auth migrations in a disposable/local database.
-- Everything, including the activation switch and fixtures, is rolled back.
begin;
do $$
declare
  actor uuid:=gen_random_uuid();
  initial_count bigint:=public.hub_member_signup_count();
  actual_role text;
begin
  update public.portal_auth_settings set enabled=true where id;
  -- GoTrue admin creation initially inserts an empty role, then sets its
  -- configured default. An in-memory model with a default role misses this.
  insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data)
    values(actor,'shared-sql-'||actor::text||'@example.invalid','','{}','{}');
  select role into actual_role from auth.users where id=actor;
  if actual_role<>'eod_portal' then raise exception 'Blank initial role was not neutralized'; end if;
  update auth.users set role='authenticated' where id=actor;
  select role into actual_role from auth.users where id=actor;
  if actual_role<>'eod_portal' then raise exception 'Default role update bypassed Hub approval'; end if;
  if exists(select 1 from public.profiles where user_id=actor) then raise exception 'Portal signup created a Hub profile'; end if;
  if initial_count<>public.hub_member_signup_count() then raise exception 'Portal signup changed Hub total'; end if;
  perform public.portal_request_hub(actor);
  perform public.portal_request_hub(actor);
  if initial_count+1<>public.hub_member_signup_count() then raise exception 'Pending Hub request did not count once'; end if;
  update public.profiles set email_verified=true,admin_verified=true,verification_status='verified' where user_id=actor;
  select role into actual_role from auth.users where id=actor;
  if actual_role<>'authenticated' then raise exception 'Explicit Hub approval did not promote identity'; end if;
  update public.profiles set admin_verified=false where user_id=actor;
  select role into actual_role from auth.users where id=actor;
  if actual_role<>'eod_portal' then raise exception 'Withdrawing Hub approval did not remove Hub role'; end if;
end $$;
rollback;
