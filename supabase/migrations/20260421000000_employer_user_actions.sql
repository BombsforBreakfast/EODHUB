-- Employer Dashboard: private employer-to-candidate annotations.
--
-- Scope intentionally narrow for launch:
--   * Only employer-role users (profiles.account_type = 'employer') may write rows.
--   * Annotations are strictly private to the employer that authored them.
--   * Candidate visibility for the dashboard is enforced at query time by
--     filtering profiles on open_to_opportunities = true. No new profiles
--     RLS or schema refactor — employer-facing fields already live on
--     public.profiles (resume_url, employer_summary, specialized_training, etc.).
--
-- Future extension (in-app video / interview threads) should hang off the
-- existing conversations/messages system, not off this table.

begin;

-- 1) Helper: is the given user an employer? Used in RLS policies to keep
--    policy expressions readable.

create or replace function public.is_employer_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = uid
      and p.account_type = 'employer'
  );
$$;

revoke all on function public.is_employer_user(uuid) from public;
grant execute on function public.is_employer_user(uuid) to authenticated;

-- 2) Annotation table.

create table if not exists public.employer_user_actions (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references auth.users (id) on delete cascade,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  is_saved boolean not null default false,
  is_interested boolean not null default false,
  is_hidden boolean not null default false,
  notes text,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employer_user_actions_not_self check (employer_id <> target_user_id),
  unique (employer_id, target_user_id)
);

create index if not exists idx_employer_user_actions_employer
  on public.employer_user_actions (employer_id);
create index if not exists idx_employer_user_actions_target
  on public.employer_user_actions (target_user_id);
create index if not exists idx_employer_user_actions_employer_saved
  on public.employer_user_actions (employer_id) where is_saved;
create index if not exists idx_employer_user_actions_employer_interested
  on public.employer_user_actions (employer_id) where is_interested;
create index if not exists idx_employer_user_actions_employer_hidden
  on public.employer_user_actions (employer_id) where is_hidden;

-- 3) updated_at touch trigger (reuses project convention).

create or replace function public._touch_employer_user_actions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_employer_user_actions_touch_updated_at
  on public.employer_user_actions;
create trigger trg_employer_user_actions_touch_updated_at
  before update on public.employer_user_actions
  for each row
  execute function public._touch_employer_user_actions_updated_at();

-- 4) RLS: row is fully private to the owning employer.

alter table public.employer_user_actions enable row level security;

drop policy if exists "employer_user_actions_select_own"
  on public.employer_user_actions;
create policy "employer_user_actions_select_own"
  on public.employer_user_actions
  for select
  to authenticated
  using (auth.uid() = employer_id);

drop policy if exists "employer_user_actions_insert_own"
  on public.employer_user_actions;
create policy "employer_user_actions_insert_own"
  on public.employer_user_actions
  for insert
  to authenticated
  with check (
    auth.uid() = employer_id
    and public.is_employer_user(auth.uid())
  );

drop policy if exists "employer_user_actions_update_own"
  on public.employer_user_actions;
create policy "employer_user_actions_update_own"
  on public.employer_user_actions
  for update
  to authenticated
  using (auth.uid() = employer_id)
  with check (
    auth.uid() = employer_id
    and public.is_employer_user(auth.uid())
  );

drop policy if exists "employer_user_actions_delete_own"
  on public.employer_user_actions;
create policy "employer_user_actions_delete_own"
  on public.employer_user_actions
  for delete
  to authenticated
  using (auth.uid() = employer_id);

commit;
