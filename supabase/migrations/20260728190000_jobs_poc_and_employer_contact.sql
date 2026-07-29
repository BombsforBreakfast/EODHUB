-- Optional POC contact on employer/community job posts (in-app hiring).
alter table public.jobs
  add column if not exists poc_name text,
  add column if not exists poc_email text,
  add column if not exists poc_phone text;

comment on column public.jobs.poc_name is
  'Optional point-of-contact name for in-hub job posts (no external apply URL required).';
comment on column public.jobs.poc_email is
  'Optional point-of-contact email for in-hub job posts.';
comment on column public.jobs.poc_phone is
  'Optional point-of-contact phone for in-hub job posts.';

-- Optional employer profile contact fields collected at onboarding / profile edit.
alter table public.profiles
  add column if not exists company_website text,
  add column if not exists company_phone text;

comment on column public.profiles.company_website is
  'Optional employer company website URL.';
comment on column public.profiles.company_phone is
  'Optional employer company / hiring phone number.';
