-- Member approval flag (used with verification_status: onboarding, vouch flow, admin verify).
-- Apply in Supabase SQL editor if you do not run migrations via CLI.

alter table public.profiles
  add column if not exists is_approved boolean not null default false;

comment on column public.profiles.is_approved is
  'True when the member is fully approved (admin or 3 vouches); mirrors verified access alongside verification_status.';

-- Keep existing verified rows consistent (column defaults to false for old rows).
update public.profiles
set is_approved = true
where verification_status = 'verified';
