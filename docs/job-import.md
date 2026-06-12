# EOD-HUB job import

External job listings are ingested via cron-backed API routes. All imported jobs default to `is_approved: false` until an admin approves them in the Admin → Jobs tab.

## Sources

| Source | Route | Cron (UTC) | Env vars |
|--------|-------|------------|----------|
| USAJobs | `GET /api/import-usajobs` | `0 6 * * *` | `USAJOBS_API_KEY`, `USAJOBS_EMAIL` |
| Adzuna | `GET /api/import-adzuna` | `30 6 * * *` | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| ReliefWeb | `GET /api/import-reliefweb` | `0 7 * * *` | `RELIEFWEB_APP_NAME` |

Shared: `CRON_SECRET` (Vercel cron Bearer auth or manual `?secret=`).

## Adzuna

Adzuna uses the US jobs API (`/v1/api/jobs/us/search/{page}`). Credentials: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`.

### Intake channels (parallel strategies)

Configured in [`app/lib/adzuna/intakeConfig.ts`](app/lib/adzuna/intakeConfig.ts):

1. **Keyword channels** — expanded `what` queries (EOD, UXO, C-IED, demining, UAS, etc.) with `max_days_old=90` and enlistment terms excluded at the API layer.
2. **Company channels** — `company=` filter for PAE, Amentum, Leidos, Parsons, Tetra Tech, KBR, Constellis, Valiant, Cape Fox. Catches generic titles from known ordnance employers.
3. **Category channels** — `engineering-jobs` and `trade-construction-jobs` crossed with ordnance keywords.

### Relevance (title + description, not title-only)

[`app/lib/adzuna/relevance.ts`](app/lib/adzuna/relevance.ts) scores **title, description, and company**. The legacy importer dropped anything without EOD terms in the **title** even when Adzuna matched on description — that gate is removed.

- Strong match in title → high confidence floor
- Strong/medium match in description only → still imported (score ≥ 55)
- Company-channel listings get a slightly lower threshold when ordnance terms appear anywhere in the posting

### Manual test

```bash
curl "https://www.eod-hub.com/api/import-adzuna?secret=$CRON_SECRET"
```

## ReliefWeb

ReliefWeb uses the official read-only API ([documentation](https://apidoc.reliefweb.int/)). As of November 2025, API users need a **pre-approved** `appname`.

### Environment

```bash
RELIEFWEB_APP_NAME=your-approved-appname
```

Set in Vercel (Production + Preview). **Never** expose this value client-side; it is only read in `app/api/import-reliefweb/route.ts`.

If `RELIEFWEB_APP_NAME` is missing, the import route returns HTTP 200 with `{ skippedRun: true }` and does not fail other crons.

### Two-stage filtering

1. **Broad API intake** — three parallel strategies in [`app/lib/reliefweb/`](app/lib/reliefweb/):
   - **Keyword batches** in [`relevanceConfig.ts`](app/lib/reliefweb/relevanceConfig.ts) search `title` + `body` (~12 batches × 2 pages, 90-day lookback).
   - **Theme filter** in [`filterIntake.ts`](app/lib/reliefweb/filterIntake.ts) fetches all jobs tagged **Mine Action** (theme id `12033`) regardless of title wording — 120-day lookback, 4 pages. This catches generic titles like “Field Coordinator” that keyword search misses.
   - **Source query** matches the posting **organization** field (HALO, MAG, NPA, etc.) — not title/body — 90-day lookback, 3 pages.
   - **Target job IDs** in [`targetJobIds.ts`](app/lib/reliefweb/targetJobIds.ts) backfill known listings by ReliefWeb id.
2. **Weighted relevance scoring** — [`app/lib/reliefweb/scoreReliefWebJob.ts`](app/lib/reliefweb/scoreReliefWebJob.ts) scores each result 0–100 using:
   - Title matches: up to 60 points
   - Metadata (org, countries, ReliefWeb themes/categories): up to 25 points
   - Description/body: up to 15 points
   - Negative humanitarian-sector terms downrank (but do not block strong EOD/HMA title matches)
   - Jobs tagged **Mine Action** are floored to “possible” confidence (score ≥ 50) so they are not suppressed solely because of a generic title

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

Targeted cross-reference (focused EOD/HMA/CIED/UAS ReliefWeb IDs vs Supabase duplicates):

```bash
npx tsx scripts/crossref-reliefweb-targeted.ts --dry-run   # report only
npx tsx scripts/crossref-reliefweb-targeted.ts             # insert new rows
npx tsx scripts/crossref-reliefweb-targeted.ts --refresh   # also refresh existing matches
```

The daily cron import also fetches [`TARGET_RELIEFWEB_JOB_IDS`](app/lib/reliefweb/targetJobIds.ts) by ID after keyword batches so focused listings are not missed by date filters.

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
