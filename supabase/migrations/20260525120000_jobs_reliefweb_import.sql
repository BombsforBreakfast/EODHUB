-- ReliefWeb API job import: external id, relevance scoring, and import metadata.

begin;

alter table public.jobs add column if not exists reliefweb_job_id text;
alter table public.jobs add column if not exists relevance_score integer;
alter table public.jobs add column if not exists import_metadata jsonb;

comment on column public.jobs.reliefweb_job_id is
  'ReliefWeb API job id; unique per listing when source_type = reliefweb.';

comment on column public.jobs.relevance_score is
  'Computed EOD/HMA/UXO relevance score from ReliefWeb import (higher = stronger match).';

comment on column public.jobs.import_metadata is
  'Importer metadata: matched keywords, queries, ReliefWeb URL, deadline, organization, etc.';

create unique index if not exists jobs_reliefweb_job_id_unique
  on public.jobs (reliefweb_job_id)
  where source_type = 'reliefweb'
    and reliefweb_job_id is not null
    and reliefweb_job_id <> '';

commit;
