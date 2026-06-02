alter table public.profiles
  add column if not exists linkedin_url text;

comment on column public.profiles.linkedin_url is
  'Public LinkedIn profile URL for member social links on profile wall.';
