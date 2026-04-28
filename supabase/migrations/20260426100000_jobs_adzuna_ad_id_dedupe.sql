-- Adzuna deduplication: one row per Adzuna listing id (see apply_url /details/ and /land/ad/ paths).
-- Backfill adzuna_ad_id, repoint saved_jobs, remove duplicate job rows, enforce uniqueness.

begin;

alter table public.jobs add column if not exists adzuna_ad_id text;

comment on column public.jobs.adzuna_ad_id is
  'Adzuna API job listing id; unique per listing when source_type = adzuna. Used for deduplication.';

-- Parse listing id from known Adzuna URL shapes
update public.jobs
set adzuna_ad_id = (regexp_match(apply_url, 'adzuna\.com/(?:land/ad|details)/(\d+)'))[1]
where source_type = 'adzuna'
  and (adzuna_ad_id is null or adzuna_ad_id = '')
  and apply_url ~ 'adzuna\.com/(?:land/ad|details)/[0-9]+';

-- Repoint saves from duplicate rows to the keeper (latest last_seen_at, then smallest id)
with ranked as (
  select
    id,
    adzuna_ad_id,
    row_number() over (
      partition by adzuna_ad_id
      order by last_seen_at desc nulls last, id asc
    ) as rn
  from public.jobs
  where source_type = 'adzuna'
    and adzuna_ad_id is not null
    and adzuna_ad_id <> ''
),
mapping as (
  select
    c1.id as keeper_id,
    c2.id as loser_id
  from ranked c1
  join ranked c2
    on c1.adzuna_ad_id = c2.adzuna_ad_id
  where c1.rn = 1
    and c2.rn > 1
)
update public.saved_jobs sj
set job_id = m.keeper_id
from mapping m
where sj.job_id = m.loser_id;

-- Collapse duplicate (user_id, job_id) after repoint
delete from public.saved_jobs a
using public.saved_jobs b
where a.user_id = b.user_id
  and a.job_id = b.job_id
  and a.id > b.id;

-- Remove duplicate job rows
with ranked as (
  select
    id,
    adzuna_ad_id,
    row_number() over (
      partition by adzuna_ad_id
      order by last_seen_at desc nulls last, id asc
    ) as rn
  from public.jobs
  where source_type = 'adzuna'
    and adzuna_ad_id is not null
    and adzuna_ad_id <> ''
)
delete from public.jobs j
using ranked r
where j.id = r.id
  and r.rn > 1;

-- Normalize display URL to /details/{id} (no per-click tracking)
update public.jobs
set apply_url = 'https://www.adzuna.com/details/' || adzuna_ad_id
where source_type = 'adzuna'
  and adzuna_ad_id is not null
  and adzuna_ad_id <> '';

create unique index if not exists jobs_adzuna_ad_id_unique
  on public.jobs (adzuna_ad_id)
  where source_type = 'adzuna' and adzuna_ad_id is not null and adzuna_ad_id <> '';

commit;
