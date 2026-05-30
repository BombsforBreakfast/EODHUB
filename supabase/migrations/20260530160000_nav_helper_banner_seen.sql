-- One-time navigation helper banner shown on a member's first verified login.
-- Once the member dismisses it, this flips to true and the banner never returns
-- (persisted server-side so it stays dismissed across devices/sessions).

alter table public.profiles
  add column if not exists nav_helper_seen boolean not null default false;
