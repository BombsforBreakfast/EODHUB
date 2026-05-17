alter table public.profiles
  drop constraint if exists profiles_access_tier_check;

alter table public.profiles
  drop column if exists access_tier;
