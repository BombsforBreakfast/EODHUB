-- Email digests are paused until launch. Admin can still trigger a dry run or
-- manual send via POST /api/cron/email-digest when ready.

do $$
begin
  perform cron.unschedule('email-digest-morning-edt');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-morning-est');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-evening-edt');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('email-digest-evening-est');
exception when others then
  null;
end $$;
