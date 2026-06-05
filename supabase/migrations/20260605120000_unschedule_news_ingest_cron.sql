-- News ingestion is admin-triggered only (Admin → News → Run ingestion now).
-- Removes the hourly pg_cron job that called /api/cron/news-ingest.

do $$
begin
  perform cron.unschedule('news-ingest-hourly');
exception when others then
  null;
end $$;
