-- Admin-only workflow: keep listing visible for savers/applicants but signal hiring is paused.
alter table public.jobs
  add column if not exists applications_under_review boolean not null default false;

comment on column public.jobs.applications_under_review is
  'When true, job stays live but shows an Applications under review badge. Set/cleared by admins only.';

create index if not exists jobs_applications_under_review_idx
  on public.jobs (applications_under_review)
  where applications_under_review = true;
