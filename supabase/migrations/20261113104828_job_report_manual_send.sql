-- Use the same lock as the scheduled report. Freeze each outgoing payload and
-- consume only unreported approvals, making repeated/concurrent clicks safe.
create function public.job_report_prepare_manual(p_cutoff timestamptz, p_live boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare rid uuid; content jsonb; ids uuid[]; day date; batch uuid;
begin
 perform pg_advisory_xact_lock(hashtext('job-report-prepare'));
 day := (p_cutoff at time zone 'America/New_York')::date;
 select jsonb_agg(snapshot||jsonb_build_object('approvedAt',approved_at) order by approved_at,job_id),array_agg(job_id)
 into content,ids from (select * from public.job_report_approvals where report_id is null and not withdrawn and approved_at<=p_cutoff order by approved_at,job_id for update) q;
 if content is null then return null; end if;
 select id into rid from public.job_report_reports where report_date=day;
 if not found then
   return public.job_report_prepare(p_cutoff,p_live);
 end if;
 -- A late batch belongs to today's report, without changing its morning snapshot.
 batch := gen_random_uuid();
 update public.job_report_approvals set report_id=rid where job_id=any(ids);
 insert into public.job_report_deliveries(subscriber_id,report_id,message_key,kind,recipient,payload,livemode)
 select s.id,rid,'report-late:'||batch||':'||s.id,'report',s.email,jsonb_build_object('date',day,'jobs',filtered.jobs),p_live
 from public.job_report_subscribers s cross join lateral (
   select jsonb_agg(item) as jobs from jsonb_array_elements(content) item where not ((item->>'id')::uuid=any(s.initial_job_ids))
 ) filtered where s.livemode=p_live and s.subscribed_at<=p_cutoff and s.status in ('active','past_due') and s.paid_until>now()
 and s.unsubscribed_at is null and s.suppressed_at is null and not s.risk_hold and filtered.jobs is not null
 on conflict(message_key) do nothing;
 return rid;
end $$;
revoke all on function public.job_report_prepare_manual(timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.job_report_prepare_manual(timestamptz,boolean) to service_role;
