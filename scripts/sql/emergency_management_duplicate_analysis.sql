-- Emergency management job duplicate analysis (Supabase SQL editor).
-- EM roles are ingested from USAJobs via the "Emergency Management Specialist" keyword
-- in app/api/import-usajobs/route.ts. Adzuna does not currently search EM keywords; any
-- Adzuna-sourced row would still be deduplicated by adzuna_ad_id after that migration.
--
-- Run sections one at a time; all are read-only.
--
-- USAJobs URLs often look like https://www.usajobs.gov:443/job/861624800 — include
-- `(?::\d+)?` before `/job/` so the job id extracts correctly (plain `usajobs.gov/job/` misses :443).

-- 0) How many "EM-like" jobs per source
select
  coalesce(source_type, '(null)') as source_type,
  count(*) as n
from public.jobs
where
  (title ~* 'emergency[[:space:]]+management' or title ~* 'em specialist' or title ~* 'emergency[[:space:]]+preparedness')
  or (description is not null and length(description) > 0 and description ~* 'emergency[[:space:]]+management')
group by 1
order by n desc;

-- 1) Same apply_url more than once (true duplicate rows) — filter EM
select
  j.apply_url,
  count(*) as n,
  min(j.title) as sample_title
from public.jobs j
where
  j.is_rejected is distinct from true
  and (j.title ~* 'emergency[[:space:]]+management' or j.title ~* 'em specialist')
  and j.apply_url is not null
  and j.apply_url <> ''
group by j.apply_url
having count(*) > 1
order by n desc;

-- 2) Heuristic: same title + company, multiple job rows (EM-scoped)
select
  j.title,
  j.company_name,
  count(*) as n,
  array_agg(distinct j.source_type) as sources,
  array_agg(j.id::text order by j.id) as job_ids
from public.jobs j
where
  j.is_rejected is distinct from true
  and (j.title ~* 'emergency[[:space:]]+management' or j.title ~* 'em specialist')
group by j.title, j.company_name
having count(*) > 1
order by n desc, j.title
limit 50;

-- 3) USAJobs: group by announcement id from apply_url (same id + row_count>1 = URL variants / true dupes)
with parsed as (
  select
    id,
    title,
    apply_url,
    source_type,
    coalesce(
      (regexp_match(apply_url, 'usajobs\.gov(?::\d+)?/job/(\d+)', 'i'))[1],
      (regexp_match(apply_url, 'ViewDetails/(\d+)', 'i'))[1]
    ) as usajobs_numeric_id
  from public.jobs
  where
    is_rejected is distinct from true
    and source_type = 'usajobs'
    and (title ~* 'emergency[[:space:]]+management' or title ~* 'em specialist')
)
select
  usajobs_numeric_id,
  count(*) as row_count,
  count(distinct apply_url) as distinct_urls,
  min(title) as sample_title
from parsed
where usajobs_numeric_id is not null
group by usajobs_numeric_id
having count(*) > 1
order by row_count desc
limit 50;

-- 4) Adzuna EM: duplicate ad zips (adzuna_ad_id); should be 0 for new data after adzuna_ad_id migration
with parsed as (
  select
    id,
    title,
    adzuna_ad_id,
    apply_url
  from public.jobs
  where
    is_rejected is distinct from true
    and source_type = 'adzuna'
    and (title ~* 'emergency[[:space:]]+management' or title ~* 'em specialist')
    and adzuna_ad_id is not null
    and adzuna_ad_id <> ''
)
select
  adzuna_ad_id,
  count(*) as row_count,
  count(distinct apply_url) as distinct_urls
from parsed
group by adzuna_ad_id
having count(*) > 1
order by row_count desc
limit 50;

-- 5) Drill-down: one title + company — if every row has a different apply_url and location,
--     those are separate announcements (e.g. many VHA facilities), not DB bugs. If the same
--     usajobs_job_id appears twice, merge/dedupe at the importer.
select
  apply_url,
  coalesce(
    (regexp_match(apply_url, 'usajobs\.gov(?::\d+)?/job/(\d+)', 'i'))[1],
    (regexp_match(apply_url, 'ViewDetails/(\d+)', 'i'))[1]
  ) as usajobs_job_id,
  location,
  id
from public.jobs
where source_type = 'usajobs'
  and is_rejected is distinct from true
  and title in ('Emergency Management Specialist', 'EMERGENCY MANAGEMENT SPECIALIST')
  and company_name = 'Veterans Health Administration'
order by location, apply_url;
