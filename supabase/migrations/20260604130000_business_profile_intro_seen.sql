-- One-time business profile welcome banner (own business profile only).
-- After dismiss (Got it or close), stays hidden across devices/sessions.

alter table public.profiles
  add column if not exists business_profile_intro_seen boolean not null default false;
