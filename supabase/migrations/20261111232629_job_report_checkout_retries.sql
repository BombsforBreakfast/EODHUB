-- Compare the previous checkout key under the subscriber row lock.
-- Preserve an existing open session, and rotate an expired attempt only once.
drop function public.job_report_reserve(text,boolean,boolean);
create function public.job_report_reserve(p_email text,p_live boolean,p_renew boolean default false,p_expected_key uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.job_report_subscribers;
begin
 insert into public.job_report_subscribers(email,livemode) values(lower(trim(p_email)),p_live) on conflict(email,livemode) do nothing;
 select * into s from public.job_report_subscribers where email=lower(trim(p_email)) and livemode=p_live for update;
 if s.status in ('pending','incomplete_expired','canceled') and ((s.checkout_session_id is null and s.checkout_started_at<now()-interval '40 minutes') or (p_renew and s.checkout_key=p_expected_key)) then
   update public.job_report_subscribers set checkout_key=gen_random_uuid(),checkout_session_id=null,checkout_started_at=now() where id=s.id returning * into s;
 end if;
 return to_jsonb(s);
end $$;

revoke all on function public.job_report_reserve(text,boolean,boolean,uuid) from public,anon,authenticated;
grant execute on function public.job_report_reserve(text,boolean,boolean,uuid) to service_role;
