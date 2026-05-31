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

If `RELIEFWEB_APP_NAME` is missing, the import route returns HTTP 200 with `{ skippedRun: true }` and does not fail other crons.

### Two-stage filtering

1. **Broad API intake** — keyword batches in [`app/lib/reliefweb/relevanceConfig.ts`](app/lib/reliefweb/relevanceConfig.ts) cast a wide ReliefWeb search net (~12 batches × 2 pages).
2. **Weighted relevance scoring** — [`app/lib/reliefweb/scoreReliefWebJob.ts`](app/lib/reliefweb/scoreReliefWebJob.ts) scores each result 0–100 using:
   - Title matches: up to 60 points
   - Metadata (org, countries, ReliefWeb themes/categories): up to 25 points
   - Description/body: up to 15 points
   - Negative humanitarian-sector terms downrank (but do not block strong EOD/HMA title matches)

Hard exclusions (never imported): mixed migration, human trafficking, trafficking in persons.

### Confidence thresholds

| Score | Confidence | Admin behavior |
|-------|------------|----------------|
| ≥ 75 | `high` | Approve button enabled; sorted to top |
| 50–74 | `possible` | Needs review badge |
| < 50 | `low` | Suppressed — skipped on import (not stored); existing rows are refreshed for score updates only |

Stored on each row:

- `relevance_score` (0–100 integer column)
- `import_metadata.relevance_confidence`
- `import_metadata.relevance_reasons` (explainable `+`/`-` strings)
- `import_metadata.needs_review`
- `import_metadata.suppressed`

### Manual test

```bash
curl "https://www.eod-hub.com/api/import-reliefweb?secret=$CRON_SECRET"
```

Local script:

```bash
npx tsx scripts/run-reliefweb-import.ts purge-pending
npx tsx scripts/run-reliefweb-import.ts
npx tsx scripts/run-reliefweb-import.ts score-samples
```

Expected JSON fields: `imported`, `refreshed`, `skipped`, `suppressed`, `confidence`, `apiCalls`, `keywordBatches`, `sample`, optional `errors`.

### Tuning

Edit keyword lists and weights in [`app/lib/reliefweb/relevanceConfig.ts`](app/lib/reliefweb/relevanceConfig.ts) only — avoid scattering terms elsewhere.

### Database migration

Apply `supabase/migrations/20260525120000_jobs_reliefweb_import.sql` to add:

- `reliefweb_job_id`
- `relevance_score`
- `import_metadata` (jsonb)

No new migration required for confidence/reasons — stored in `import_metadata`.

### Admin review

Pending ReliefWeb jobs show source badge **ReliefWeb**, numeric score, **HIGH / POSSIBLE / LOW** confidence badge, score reasons, organization, countries, themes, deadline, and a ReliefWeb link. Suppressed listings cannot be approved.
