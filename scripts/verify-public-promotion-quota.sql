-- Run against EOD-HUB after the public-intake migration. Everything rolls back:
-- no customer submissions, notifications or storage objects are retained.
begin;
do $$
declare
  reviewer uuid := 'a28ddac8-dc3a-4ae1-83f5-b675e7b85871';
  source text := repeat('c',64);
  first_id uuid;
  request_id uuid;
  input jsonb := jsonb_build_object('package','Basic','name','Quota verification','email','promote@eod-hub.com','phone','5550101000','business','TEST only','promotionType','Training or event','description','Rollback-only persistent quota verification.','destination','','timing','');
  blocked boolean := false;
begin
  if has_function_privilege('anon','public.start_public_promotion_request(uuid,text,uuid,jsonb,text)','execute') or
     has_function_privilege('authenticated','public.start_public_promotion_request(uuid,text,uuid,jsonb,text)','execute') then
    raise exception 'Public clients must not execute the service RPC';
  end if;
  for i in 1..10 loop
    request_id := gen_random_uuid();
    if i=1 then first_id := request_id; end if;
    perform public.start_public_promotion_request(request_id,md5('quota-owner-'||i)||md5('quota-owner-'||i),reviewer,input,source);
  end loop;
  begin
    perform public.start_public_promotion_request(gen_random_uuid(),repeat('e',64),reviewer,input,source);
  exception when sqlstate 'PPR01' then blocked:=true;
  end;
  if not blocked then raise exception 'Changing browser sessions bypassed the quota'; end if;
  -- Same draft still retries when the connection is at its limit.
  if public.start_public_promotion_request(first_id,md5('quota-owner-1')||md5('quota-owner-1'),reviewer,input,source)<>first_id then
    raise exception 'Retry failed';
  end if;
  -- Moving networks never grants ownership of another browser's draft.
  blocked:=false;
  begin
    perform public.start_public_promotion_request(first_id,repeat('e',64),reviewer,input,repeat('d',64));
  exception when raise_exception then blocked:=true;
  end;
  if not blocked then raise exception 'Another session gained access to the draft'; end if;
end $$;
select 'PASS: persistent ten-request quota, retry, ownership and RPC permissions' as result;
rollback;
