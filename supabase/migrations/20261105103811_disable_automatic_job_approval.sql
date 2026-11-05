-- Imported jobs require an explicit human approval, regardless of score.
create or replace function public.auto_approve_explicit_job(target_job_id uuid, expected_job jsonb, expected_exclusions jsonb, approval_reason text, policy_version text)
returns uuid language sql security invoker set search_path = '' as $$ select null::uuid; $$;
revoke all on function public.auto_approve_explicit_job(uuid,jsonb,jsonb,text,text) from public, anon, authenticated, service_role;
