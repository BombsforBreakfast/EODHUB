# International EOD/HMA job coverage audit

**Generated:** 2026-07-26  
**Method:** Production `jobs` table analysis (`scripts/audit-intl-job-coverage.ts`), ReliefWeb scorer samples (`scripts/run-reliefweb-import.ts score-samples`), intake config review, live ReliefWeb API dry-run attempt (`scripts/audit-reliefweb-live-intake.ts`).

## Verdict

**Baseline (pre-expansion):** International EOD/HMA was not adequately covered. Only ReliefWeb was international; Adzuna and LinkedIn were US-locked.

**Expansion (2026-07-26):** LinkedIn now searches HMA keywords (+ lean EOD/UXO) across US/UK/AU/CA/ZA/Ukraine/Germany. Adzuna searches `us` (full channels) plus `gb`/`au`/`ca`/`za` (lean HMA/EOD keywords). Re-run `scripts/audit-intl-job-coverage.ts` after a few cron/LinkedIn cycles to measure lift.

ReliefWeb remains the NGO/mine-action specialist pipe; LinkedIn + Adzuna close commercial/contractor gaps in allowlisted markets — not every country worldwide.

## Coverage matrix (config)

| Source | Geo in code | HMA / demining intake | Intl EOD/HMA today |
|--------|-------------|----------------------|--------------------|
| USAJobs | US federal API | No HMA channel | OCONUS federal text only |
| Adzuna | `us` + `gb`/`au`/`ca`/`za` allowlist | Yes (`kw:demining` + intl lean set) | Allowlisted markets |
| LinkedIn | US core + HMA/EOD across 7 locations | Yes (demining / mine action / HMA / UXO clearance) | Allowlisted markets |
| ReliefWeb | Global + Mine Action theme + HMA NGO sources | Yes | Yes (thin volume) |

Key files:

- [`app/lib/adzuna/intakeConfig.ts`](../app/lib/adzuna/intakeConfig.ts) — `ADZUNA_COUNTRIES`, `ADZUNA_INTL_KEYWORD_CHANNELS`
- [`app/lib/linkedin/intakeConfig.ts`](../app/lib/linkedin/intakeConfig.ts) — `LINKEDIN_HMA_LOCATIONS`, HMA + intl core queries
- [`app/lib/reliefweb/filterIntake.ts`](../app/lib/reliefweb/filterIntake.ts) — Mine Action theme `12033`, HMA NGO source channel
- [`app/lib/reliefweb/relevanceConfig.ts`](../app/lib/reliefweb/relevanceConfig.ts) — international keyword batches

## Production DB (as of audit)

### All-time counts by `source_type`

| Source | Rows |
|--------|------|
| linkedin | 99 |
| adzuna | 80 |
| usajobs | 63 |
| reliefweb | **15** |
| community | (also present; not an API importer) |

### Last 30 days

| Source | Total | HMA-ish title/body | EOD-ish title/body | Has `import_metadata.countries` |
|--------|------:|-------------------:|-------------------:|--------------------------------:|
| linkedin | 99 | 1* | 32 | 0 |
| adzuna | 67 | **0** | 45 | 0 |
| usajobs | 63 | 0 | 0† | 0 |
| reliefweb | 14 | **13** | 14 | **14** |
| community | 12 | 0 | 7 | 0 |

\* LinkedIn “HMA-ish” hit was a false positive (`MAG` in “MAG Aerospace”).  
† USAJobs EOD signal often lives in announcement body / series codes; title regex under-counts.

### Last 90 days

Same pattern: ReliefWeb **15** rows (14 HMA-ish); Adzuna **0** HMA-ish; LinkedIn essentially **0** true HMA.

### ReliefWeb countries in DB (90d)

Ukraine (5), Syrian Arab Republic (3), occupied Palestinian territory (2), Colombia, Lao PDR, Denmark (HQ), Senegal, Zimbabwe (1 each).

Sample titles: Humanitarian Mine Action Operations Manager (Ukraine), Technical Field Manager (Laos / Zimbabwe / Syria), Global Technical Lead HMA (Denmark HQ), Community Liaison Manager (Senegal / Ukraine).

## ReliefWeb scorer samples

`npx tsx scripts/run-reliefweb-import.ts score-samples`:

| Sample | Score | Result |
|--------|------:|--------|
| Humanitarian Mine Action Operations Manager | 75 | ingest (high) |
| EOD Technical Advisor + HALO/Ukraine metadata | 75 | ingest (high) |
| Country Director (nutrition/WASH) | 0 | suppressed |
| Generic Security Advisor | 10 | suppressed |

Scorer correctly prefers HMA/EOD and drops generic NGO noise.

## Live ReliefWeb API dry-run

`scripts/audit-reliefweb-live-intake.ts` against local `.env.local` `RELIEFWEB_APP_NAME` returned **403 AccessDeniedHttpException** (appname not approved for this machine). Production cron is clearly using a valid appname (DB has live ReliefWeb rows). Re-run the live dry-run on a host with the production-approved appname, or hit production import only when you intend to write.

## Blind-spot estimate

| Surface | Status |
|---------|--------|
| ReliefWeb Mine Action / HMA NGOs | Covered, but only **~15** jobs retained historically — either ReliefWeb volume is modest, page caps bite, or many posts score/suppress out |
| LinkedIn intl HMA/EOD | **Blind** — US-only location + no HMA queries |
| Adzuna non-US countries | **Blind** — country hard-coded `us` (demining query never leaves the US index) |
| National boards / Indeed / ClearanceJobs intl | **Not imported** |

So: you are **not** “adequately covered” by Adzuna + LinkedIn + USAJobs for international HMA. ReliefWeb is the only pipe, and it is a thin slice of the global market. “Hundreds missing” is plausible for LinkedIn/national boards combined; it is not proven from DB alone without an external scrape of those boards.

## Expansion status

1. **LinkedIn** — Done: HMA keywords × 7 locations; lean EOD/UXO for non-US; run cap 60 / per-query 3.
2. **Adzuna** — Done: countries `us,gb,au,ca,za`; intl lean keyword set; US keeps company/category channels.
3. **ReliefWeb** — Still optional: raise page caps / score floor only if live dry-run shows many high-quality suppressions.

## How to re-run this audit

```bash
# DB volume / HMA vs source (needs service role in .env.local)
npx tsx scripts/audit-intl-job-coverage.ts

# Scorer sanity
npx tsx scripts/run-reliefweb-import.ts score-samples

# Live ReliefWeb fetch+score (no DB writes; needs approved RELIEFWEB_APP_NAME)
npx tsx scripts/audit-reliefweb-live-intake.ts
```
