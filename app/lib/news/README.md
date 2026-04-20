# News ingestion (v1)

Lean server-side pipeline that adds 5–10 high-relevance EOD-related external
stories per day. Approved items become **shadow posts** in `public.posts`
authored by the `RUMINT` system user (see
`supabase/migrations/20260420040000_news_shadow_posts.sql`). This means news
items render in the feed as regular posts with full community features —
likes, comments (incl. emojis + GIFs), Kangaroo Court, Rabbithole save —
without any news-specific render path.

Everything ingestion-related lives under `app/lib/news/`. The
`news_items` table is still the ingestion/moderation workspace; a DB trigger
keeps its `shadow_post_id` in sync with the `public.posts` row that
represents it in the feed.

## Approval gate

Nothing reaches the public feed automatically. New items land in
`news_items` with `status = 'pending'`. An admin reviews them in the Admin
Panel **News** tab and clicks **Approve to feed** or **Reject**. Only
`status = 'published'` rows are visible to anon/authenticated readers (RLS
enforced).

This gate exists so we can validate the relevance scoring + filtering before
external content starts showing up to users.

## Operations

### One-time setup

1. **Pick a long random secret** (e.g. `openssl rand -hex 32`).
2. **Set it as `NEWS_CRON_SECRET`** in the Vercel project env (Production +
   Preview).
3. **Store the same value in Supabase Vault** so pg_cron can read it at call
   time. Run this once in the Supabase SQL editor (you do NOT need superuser
   for Vault — `alter database … set app.*` would require superuser and is
   rejected on managed Supabase, which is why we use Vault instead):

   ```sql
   select vault.create_secret(
     '<the-same-secret>',
     'news_cron_secret',
     'Bearer token for /api/cron/news-ingest'
   );
   ```

   To rotate later:

   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'news_cron_secret'),
     '<new-secret>'
   );
   ```

   This is intentionally NOT in the migration (the secret should never live
   in git).

4. The migration `20260420000000_news_items.sql` already enabled `pg_cron` +
   `pg_net` and scheduled the hourly call. Verify with:

   ```sql
   select * from cron.job where jobname = 'news-ingest-hourly';
   ```

### Manual trigger (admin only)

The Admin Panel → News tab has a **Run ingestion now** button that calls
`POST /api/admin/news/run-ingestion`. Same caps, same idempotency. Useful
for validating scoring after editing config files.

You can also call from a shell with the cron secret:

```bash
curl -X POST -H "Authorization: Bearer $NEWS_CRON_SECRET" \
  https://www.eod-hub.com/api/cron/news-ingest
```

The endpoint returns `{ ok, stats: { fetched, scored, belowThreshold, duplicates, inserted, capped, errors } }`.

## Tuning

| What you want to change | File |
| --- | --- |
| Add/remove an RSS source | `config/sources.ts` |
| Edit GDELT search queries | `config/queries.ts` |
| Add positive/negative keywords or score weights | `config/keywords.ts` |
| Per-run / per-day caps | `runner.ts` (`MAX_PER_RUN`, `MAX_PER_DAY`) |
| Discovery API provider | `providers/discovery.ts` (swap behind `NewsProvider` interface) |

## Env vars

| Var | Where | Purpose |
| --- | --- | --- |
| `NEWS_CRON_SECRET` | Vercel + `alter database … set app.news_cron_secret = …` | Shared secret between Supabase pg_cron and the Next.js cron route |
| `NEXT_PUBLIC_SUPABASE_URL` | Already set | Used by both client + service-role server code |
| `SUPABASE_SERVICE_ROLE_KEY` | Already set | Service-role inserts into `news_items` |

(GDELT requires no API key.)
