-- Service-only approval with a locked, unchanged snapshot. Never produces a human-learning vote.
create function public.auto_approve_explicit_job(target_job_id uuid, expected_job jsonb, expected_exclusions jsonb, approval_reason text, policy_version text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.jobs%rowtype; rules jsonb;
begin
  if expected_job is null or jsonb_typeof(expected_job)<>'object' or not (expected_job ?& array['id','title','description','source_type','import_metadata']) then return null; end if;
  -- Serializes auto approvals so equivalent listings arriving from different sources cannot both pass.
  perform pg_catalog.pg_advisory_xact_lock(70183010301924);
  select * into target from public.jobs where id=target_job_id for update;
  if not found or target.is_rejected is true or target.is_approved is true
    or target.created_at is null or target.created_at < now() - interval '30 days'
    or target.source_type is null or target.source_type not in ('adzuna','usajobs','linkedin','reliefweb')
    or not (to_jsonb(target) @> expected_job) then return null; end if;
  if target.title !~* '\m(explosive[[:space:]]+ordnance[[:space:]]+disposal|uxo|unexploded[[:space:]]+ordnance)\M' then return null; end if;
  if target.source_type='reliefweb' and (target.import_metadata->>'suppressed'='true' or target.import_metadata->>'relevance_confidence'='low') then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'phrase',phrase) order by id),'[]'::jsonb) into rules from public.job_type_exclusions;
  if rules is distinct from expected_exclusions then return null; end if;
  -- Recheck exact role identity under the lock to preserve new rejection/approval decisions.
  if length(trim(coalesce(target.title,'')))>0 and length(trim(coalesce(target.company_name,'')))>0 and length(trim(coalesce(target.location,'')))>0 and exists (
    select 1 from public.jobs j where j.id<>target.id and (j.is_rejected is true or (j.is_approved is true and j.created_at >= now()-interval '30 days'))
    and regexp_replace(lower(j.title),'[^a-z0-9]+',' ','g')=regexp_replace(lower(target.title),'[^a-z0-9]+',' ','g')
    and regexp_replace(lower(j.company_name),'[^a-z0-9]+',' ','g')=regexp_replace(lower(target.company_name),'[^a-z0-9]+',' ','g')
    and regexp_replace(lower(j.location),'[^a-z0-9]+',' ','g')=regexp_replace(lower(target.location),'[^a-z0-9]+',' ','g')
  ) then return null; end if;
  update public.jobs set is_approved=true, import_metadata=coalesce(target.import_metadata::jsonb,'{}'::jsonb)||jsonb_build_object('auto_approval',jsonb_build_object('policy',policy_version,'reason',approval_reason,'approved_at',now())) where id=target.id;
  return target.id;
end;
$$;
revoke all on function public.auto_approve_explicit_job(uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.auto_approve_explicit_job(uuid,jsonb,jsonb,text,text) to service_role;
