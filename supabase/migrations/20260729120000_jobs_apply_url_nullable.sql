-- Allow in-hub employer job posts with no external apply URL.
-- EmployerPostJobModal /api/employer/jobs already send apply_url: null when blank;
-- the column was still NOT NULL, which blocked those inserts.

alter table public.jobs
  alter column apply_url drop not null;

comment on column public.jobs.apply_url is
  'External apply / listing URL. Nullable for jobs promoted inside EOD-HUB with POC contact only.';
