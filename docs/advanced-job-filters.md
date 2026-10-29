# Advanced Jobs filters

Members can combine opportunity type, multiple states/countries, keyword phrases
and exclusions, title-only search, CONUS/OCONUS, added date, USD pay, education,
clearance level/timing, work arrangement and employment type. Options within one
group match any selected option; separate groups must all match. Search words
use AND, quoted phrases stay together, and any excluded term removes a match.
Preferences are stored per member in this browser. Clear all resets them.

The board retrieves all approved active listings through ordered API pages;
the displayed results use 24-card pages. The existing 30-day retention window,
member access checks, saved jobs, sharing, moderation and import exclusion rules
remain in effect. The feed's recent-jobs strip retains its own small limit.

## Evidence and corrections

`jobFacets.ts` derives tags from title, description and source details. Missing
requirements remain unknown. Broad imported EOD/CWMD categories alone do not
establish direct EOD work. Roles with EOD in an engineering/sales/analyst title
are treated as related opportunities. Source snippets cannot establish absent
requirements. These rules are conservative aids, not credential eligibility checks.

Admin → Jobs → Edit → Search filter corrections lets an admin override or restore
Automatic for relevance, education, clearance, timing, workplace, employment,
pay period and pay source. The authenticated admin API validates the enums.
Corrections are stored in `jobs.filter_overrides`, separately from import data,
so source refreshes cannot erase them. Existing jobs RLS and grants are retained.

Pay comparisons use a known USD period, with separate annual/hourly inputs and
no silent conversion. Members choose whether the upper end or the starting
amount must meet their threshold. Unknown/incomparable pay can be included
explicitly. Estimated and unconfirmed pay can be excluded. Existing pay fields
whose period is unconfirmed are labelled rather than guessed from magnitude.

## Import enrichment

USAJOBS now retains Education, Requirements, Evaluations, HowToApply and
OtherInformation alongside the existing summary, qualifications and duties.
It captures remuneration, schedules and locations. The established intake scorer
continues using its original summary, preserving existing matching/exclusions.
Refreshes expand descriptions only when the saved text is unchanged (a prefix
of the full imported description), and fill only missing pay/clearance values.

Adzuna retains location hierarchy, country/currency, employment type, annual
pay period and salary prediction flag. Its standard search API provides a
description excerpt; the full card says so and links to the source. ReliefWeb
already retains full body text, and the LinkedIn scraper already attempts a
detail-page description. Imported HTML is displayed as text, never injected.

`scripts/enrich-active-job-filters.ts` defaults to read-only preparation for
existing approved active USAJOBS/Adzuna jobs. `--audit=path` saves the before/after
plan. `--reuse=path --reuse-only --audit=new-path --apply` applies reviewed source
matches without more source requests. Application uses comparison guards to
avoid overwriting concurrent metadata/manual field edits. It never inserts jobs,
approves them, rejects them, or performs retention deletes. A missing/closed
source match preserves the original listing. Three API errors stop preparation
before writes. Credentials come from the environment; an optional local
`JOB_ENRICHMENT_ENV_FILE` can load an existing environment file. Audit files must
stay outside the repository.

## Validation

`node --import tsx --test scripts/verify-job-filters.test.ts scripts/verify-usajobs-intake.test.ts scripts/verify-adzuna-intake.test.ts scripts/verify-job-import-exclusions.test.ts`

Checks cover unknown information, negation, phrases/exclusions, multiple
locations, geography, pay units/currencies, estimation, source enrichment,
admin corrections, simultaneous full-time/contract roles and complete board
pagination beyond 500 records. Full TypeScript and scoped lint checks apply.

Primary source documentation:
- https://developer.adzuna.com/docs/search
- https://developer.usajobs.gov/api-reference/get-api-search
- https://supabase.com/docs/reference/javascript/range
