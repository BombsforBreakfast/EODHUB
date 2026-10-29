-- Separate from import_metadata: source refreshes must preserve human corrections.
-- Existing jobs RLS, grants and approval requirements remain in force.
alter table public.jobs add column if not exists filter_overrides jsonb;
alter table public.jobs add constraint jobs_filter_overrides_object
  check (filter_overrides is null or jsonb_typeof(filter_overrides) = 'object');
comment on column public.jobs.filter_overrides is 'Optional human corrections to evidence-based Jobs search facets; imports do not write this column.';
