# Advanced Jobs filters

Members can combine opportunity type, multiple states/countries, keyword phrases
and exclusions, title-only search, CONUS/OCONUS, added date, USD pay, education,
clearance level/timing and employment type. Options within one
group match any selected option; separate groups must all match. Search words
use AND, quoted phrases stay together, and any excluded term removes a match.
Preferences are stored per member in this browser. Clear all resets them.
Work arrangement is informational only: its filter controls are removed, and
legacy Remote/Hybrid/On-site preferences are discarded and ignored during matching.

Geography always offers all 50 states, DC and Puerto Rico, including locations
with no current listings. Four Census-region checkboxes (Northeast, Midwest,
South, West) select their member states; selections can be combined and then
adjusted state by state. DC is in South; Puerto Rico is selectable separately.
CONUS and OCONUS are also checkboxes and can be combined. Existing singular
geography preferences are restored into the new multi-selection format.

Employer selection is removed from both views. Legacy saved employer choices
are discarded on restoration and ignored during matching/chip rendering, so an
invisible filter cannot narrow results. Employer names and common company tags
remain on cards, and keyword search can still match employer names.

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

## Incomplete location matching

`resolveJobLocation` combines explicit source hierarchy with the public Census
2025 county/place lookup. City and county candidates are intersected; unique
counties also resolve neighborhoods and installation names. Two verified
city/county pairs and Fort Bragg/Cumberland County cover Gazetteer naming gaps.
Explicit state hints in a job title can resolve an otherwise ambiguous location.
Conflicting title and location states are flagged for review instead of silently
selecting either. Duplicate/broad locations remain unspecified. Source location
text stays visible; cards and details label inferred or conflicting matches.

This is computed locally from existing listings; it does not alter imports, job
records, approval, or access. Rebuild the generated lookup with
`python scripts/build-job-location-index.py <archive directory>` using the
`2025_Gaz_counties_national.zip` and `2025_Gaz_place_national.zip` files from
https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/.
The output records both archive SHA-256 hashes for reproducibility.

## List / Map view

List remains the default and retains the deployed card grid, details, saved jobs,
sorting, 24-card pagination and moderation controls. Map adds a lazy-loaded map
above the same cards. Both views share one filter state, and map locations also
appear as the existing removable Geography chips. Map counts include all loaded
approved active jobs that match the other filters, before state/country choices;
multi-location jobs count once in each relevant bucket. Choosing states or
countries combines them with OR, and all other filters still apply.

The map covers all 50 states, DC and PR, with international country/region
callouts from real inventory. Full source locations are available in state
tooltips and country callouts. Broad U.S., missing and conflicting locations stay
available in Lacks location detail. There are no fabricated exact city pins.
Geometry is preprojected from us-atlas 3.0.1 Census-derived states with d3-geo
Albers USA and a Mercator PR inset. No runtime geocoder, API key or external map
request is required. The geometry chunk loads only when Map is opened.

Every populated state with an on-screen anchor gets a readable count badge,
including small East Coast states. Crowded badges move with leader lines rather
than being hidden. Clicking a state or its badge again removes that selection;
selected fill and count badges are visibly distinct from hover. The status below
the map reports the selected locations and matching jobs.

The bottom-right +/− controls zoom from 100% to 800%. East Coast fits the
northeastern states; Reset view restores the full map without clearing filters.
Users can drag a zoomed map, pinch with two pointers, or use Ctrl/Command-wheel.
Dragging suppresses the resulting click so it does not accidentally select a
state. Ordinary wheel scrolling remains page scrolling.

Theme colors follow the app ThemeProvider. A ResizeObserver recalculates map
scale and readable labels after container resize or rotation while retaining
the zoom and geographic center within pan bounds. Landscape phones use a
height-aware canvas. Native count buttons, state keyboard controls and the
existing Geography checkboxes offer alternative selection methods.

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

`node --import tsx --test scripts/verify-job-filters.test.ts scripts/verify-job-map.test.ts scripts/verify-usajobs-intake.test.ts scripts/verify-adzuna-intake.test.ts scripts/verify-job-import-exclusions.test.ts`

Checks cover unknown information, negation, phrases/exclusions, multiple
locations, geography, pay units/currencies, estimation, source enrichment,
admin corrections, simultaneous full-time/contract roles and complete board
pagination beyond 500 records. Full TypeScript and scoped lint checks apply.

Primary source documentation:
- https://developer.adzuna.com/docs/search
- https://developer.usajobs.gov/api-reference/get-api-search
- https://supabase.com/docs/reference/javascript/range
- https://www.census.gov/programs-surveys/geography/about/glossary.html
