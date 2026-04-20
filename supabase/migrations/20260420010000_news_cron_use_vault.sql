-- Switch the news ingestion cron from a database GUC (`app.news_cron_secret`,
-- requires superuser) to Supabase Vault, which is the supported way to store
-- secrets on managed Supabase projects.
--
-- AFTER this migration runs you must store the secret ONCE via the SQL editor:
--
--   select vault.create_secret(
--     '<the same value as Vercel NEWS_CRON_SECRET>',
--     'news_cron_secret',
--     'Bearer token for /api/cron/news-ingest'
--   );
--
-- To rotate later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'news_cron_secret'),
--     '<new-secret>'
--   );
--
-- The cron job reads the live decrypted value at call time, so rotating the
-- secret takes effect on the next tick without rescheduling.

create extension if not exists supabase_vault;

-- Drop the previous broken schedule (it referenced current_setting('app...') which is empty).
do $$
begin
  perform cron.unschedule('news-ingest-hourly');
exception when others then
  null;
end $$;

select cron.schedule(
  'news-ingest-hourly',
  '17 * * * *',
  $$
    select net.http_post(
      url := 'https://www.eod-hub.com/api/cron/news-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'news_cron_secret' limit 1),
          ''
        )
      ),
      body := '{}'::jsonb
    );
  $$
);
