-- Onboarding funnel events (service_role writes via API) + backfill first/last
-- from mirrored OAuth name where columns were never populated.

begin;

create table if not exists public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  step text not null,
  event text not null default 'view',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.onboarding_events is
  'Step-by-step signup funnel for diagnosing where new users drop off.';

create index if not exists onboarding_events_step_created_idx
  on public.onboarding_events (step, created_at desc);

create index if not exists onboarding_events_user_created_idx
  on public.onboarding_events (user_id, created_at desc)
  where user_id is not null;

alter table public.onboarding_events enable row level security;
-- No policies: deny-by-default; service_role API routes only.

-- Backfill first_name / last_name from profiles.name when both columns empty
-- and the mirrored name contains at least two tokens.
update public.profiles p
set
  first_name = split_part(trim(p.name), ' ', 1),
  last_name = nullif(
    trim(substring(trim(p.name) from position(' ' in trim(p.name)) + 1)),
    ''
  )
where nullif(trim(coalesce(p.first_name, '')), '') is null
  and nullif(trim(coalesce(p.last_name, '')), '') is null
  and nullif(trim(coalesce(p.name, '')), '') is not null
  and position(' ' in trim(p.name)) > 0;

-- Also try display_name when name is empty.
update public.profiles p
set
  first_name = split_part(trim(p.display_name), ' ', 1),
  last_name = nullif(
    trim(substring(trim(p.display_name) from position(' ' in trim(p.display_name)) + 1)),
    ''
  )
where nullif(trim(coalesce(p.first_name, '')), '') is null
  and nullif(trim(coalesce(p.last_name, '')), '') is null
  and nullif(trim(coalesce(p.display_name, '')), '') is not null
  and position(' ' in trim(p.display_name)) > 0;

commit;
