begin;

alter table public.promotion_requests add column source_hash text check (source_hash is null or length(source_hash)=64);
create index promotion_requests_source_quota on public.promotion_requests(source_hash,created_at);

-- Shared across server instances and browser-cookie resets. Raw IPs are never
-- stored; the server supplies an HMAC key using its existing service credential.
create function public.start_public_promotion_request(p_id uuid,p_owner text,p_recipient uuid,p_input jsonb,p_source text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_source is null or length(p_source)<>64 then raise exception 'Invalid source'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_source,1));
  -- Retrying an existing draft does not consume quota, including after moving
  -- between networks. The original routine still verifies its owner and age.
  if not exists(select 1 from public.promotion_requests where id=p_id) and
     (select count(*) from public.promotion_requests where source_hash=p_source and created_at>now()-interval '24 hours')>=10 then
    raise exception using errcode='PPR01',message='Daily request limit reached';
  end if;
  v_id:=public.start_promotion_request(p_id,p_owner,p_recipient,p_input);
  update public.promotion_requests set source_hash=p_source where id=v_id and source_hash is null;
  return v_id;
end $$;
revoke all on function public.start_public_promotion_request(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.start_public_promotion_request(uuid,text,uuid,jsonb,text) to service_role;

commit;
