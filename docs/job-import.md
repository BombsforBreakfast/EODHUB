# EOD-HUB job import

External job listings are ingested via cron-backed API routes. All imported jobs default to `is_approved: false` until an admin approves them in the Admin → Jobs tab.

## Sources

| Source | Route | Cron (UTC) | Env vars |
|--------|-------|------------|----------|
| USAJobs | `GET /api/import-usajobs` | `0 6 * * *` | `USAJOBS_API_KEY`, `USAJOBS_EMAIL` |
| Adzuna | `GET /api/import-adzuna` | `30 6 * * *` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| ReliefWeb | `GET /api/import-reliefweb` | `0 7 * * *` | `RELIEFWEB_APP_NAME` |

Shared: `CRON_SECRET` (Vercel cron Bearer auth or manual `?secret=`).

## ReliefWeb

ReliefWeb uses the official read-only API ([documentation](https://apidoc.reliefweb.int/)). As of November 2025, API users need a **pre-approved** `appname`.

### Environment

```bash
RELIEFWEB_APP_NAME=your-approved-appname
```

Set in Vercel (Production + Preview). **Never** expose this value client-side; it is only read in `app/api/import-reliefweb/route.ts`.

If `RELIEFWEB_APP_NAME` is missing, the import route returns HTTP 200 with `{ skipped: true }` and does not fail other crons.

### Behavior

- Broad keyword batches (OR queries) with in-run dedupe by `reliefweb_job_id`
- Relevance scoring stored in `relevance_score` and `import_metadata` (matched keywords, deadline, organization, etc.)
- Jobs with score &lt; 8 are skipped unless title/body contains a high-confidence EOD/HMA term
- Stale ReliefWeb rows (`last_seen_at` &gt; 30 days) are purged unless `is_rejected`

### Manual test

```bash
curl "https://www.eod-hub.com/api/import-reliefweb?secret=$CRON_SECRET"
```

Expected JSON fields: `imported`, `refreshed`, `skipped`, `purged`, `apiCalls`, `keywordBatches`, `sample`, optional `errors`.

### Database migration

Apply `supabase/migrations/20260525120000_jobs_reliefweb_import.sql` to add:

- `reliefweb_job_id`
- `relevance_score`
- `import_metadata` (jsonb)

### Admin review

Pending ReliefWeb jobs show source badge **ReliefWeb**, relevance score, matched keywords, organization, countries, deadline, and a ReliefWeb link.
