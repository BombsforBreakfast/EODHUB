-- Keep complete titles intact; imported job titles are not limited to 100 characters.
-- Preserve normalization, uniqueness, RLS and existing rules.
alter table public.job_type_exclusions
  drop constraint job_type_exclusions_phrase_check,
  add constraint job_type_exclusions_phrase_check
    check (length(phrase) >= 3 and phrase ~ '^[a-z0-9]+( [a-z0-9]+)*$');
