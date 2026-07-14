-- LinkedIn local-import deduplication (Playwright script posts batches to /api/import-linkedin).

begin;

alter table public.jobs add column if not exists linkedin_job_id text;

comment on column public.jobs.linkedin_job_id is
  'LinkedIn job listing id from /jobs/view/{id}; unique when source_type = linkedin.';

create unique index if not exists jobs_linkedin_job_id_unique
  on public.jobs (linkedin_job_id)
  where source_type = 'linkedin' and linkedin_job_id is not null and linkedin_job_id <> '';

commit;
