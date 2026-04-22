-- Pure admin (EOD HUB staff) flag for profiles.
-- A "pure admin" has full moderator/god rights (is_admin=true) but:
--   * No public profile (avatar is the EOD HUB logo, not clickable)
--   * Skips all profile-building onboarding questions
--   * Account is internal-only; not surfaced in member directories, vouch flows, etc.
--
-- Bootstrapping: the app's onboarding page auto-promotes any user whose email matches
-- `app/lib/pureAdminAllowlist.ts` to pure admin on first sign-in (via Google OAuth).

alter table public.profiles
  add column if not exists is_pure_admin boolean not null default false;

comment on column public.profiles.is_pure_admin is
  'Internal EOD HUB staff account: has full admin (is_admin) god rights but no public profile, no onboarding, EOD HUB logo as avatar.';

create index if not exists idx_profiles_is_pure_admin
  on public.profiles (user_id)
  where is_pure_admin = true;
