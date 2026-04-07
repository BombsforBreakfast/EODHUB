alter table public.profiles
  add column if not exists access_tier text;

alter table public.profiles
  drop constraint if exists profiles_access_tier_check;

alter table public.profiles
  add constraint profiles_access_tier_check
  check (access_tier is null or access_tier in ('basic', 'senior', 'master'));

comment on column public.profiles.access_tier is
  'Feature tier scaffold: basic, senior, master. Beta fallback defaults null to senior in app logic.';
