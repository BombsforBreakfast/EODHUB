-- When a verified member dismisses a pending member's vouch card (×), record it
-- so that card never reappears for that viewer. Does not affect the vouchee's
-- verification progress or other members' feeds.

begin;

create table if not exists public.profile_vouch_dismissals (
  viewer_user_id uuid not null references auth.users (id) on delete cascade,
  vouchee_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint profile_vouch_dismissals_not_self check (viewer_user_id <> vouchee_user_id),
  primary key (viewer_user_id, vouchee_user_id)
);

create index if not exists profile_vouch_dismissals_vouchee_idx
  on public.profile_vouch_dismissals (vouchee_user_id);

comment on table public.profile_vouch_dismissals is
  'Verified members who dismissed a pending member vouch card — hidden only for that viewer.';

alter table public.profile_vouch_dismissals enable row level security;

drop policy if exists profile_vouch_dismissals_select_own on public.profile_vouch_dismissals;
create policy profile_vouch_dismissals_select_own
  on public.profile_vouch_dismissals
  for select
  to authenticated
  using (viewer_user_id = auth.uid());

drop policy if exists profile_vouch_dismissals_insert_own on public.profile_vouch_dismissals;
create policy profile_vouch_dismissals_insert_own
  on public.profile_vouch_dismissals
  for insert
  to authenticated
  with check (viewer_user_id = auth.uid());

commit;
