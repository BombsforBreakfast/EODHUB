-- User-submitted stale-job reports. Surfaces dead links / expired listings to
-- admins so they can review + delete. Separate from the generic `flags` table
-- because the resolution action is "delete the job row" (not "hide content")
-- and the reasons are job-specific.
--
-- One row per (job_id, reporter_id) so spamming the button doesn't inflate
-- counts. The trigger that bumps `jobs.community_stale_count` keeps the
-- per-job tally cheap to read in admin queries.

begin;

create table if not exists public.job_stale_flags (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'dead_link',
    'expired',
    'position_filled',
    'incorrect_info',
    'other'
  )),
  notes text,
  status text not null default 'open' check (status in (
    'open',
    'dismissed',
    'job_deleted'
  )),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text,
  unique (job_id, reporter_id)
);

create index if not exists job_stale_flags_job_idx
  on public.job_stale_flags (job_id);
create index if not exists job_stale_flags_status_idx
  on public.job_stale_flags (status)
  where status = 'open';
create index if not exists job_stale_flags_created_at_idx
  on public.job_stale_flags (created_at desc);

-- Denormalized open-flag count on the job row so admin lists can sort/badge
-- without an aggregate join. Trigger keeps it accurate.
alter table public.jobs
  add column if not exists community_stale_count integer not null default 0;

create index if not exists jobs_community_stale_count_idx
  on public.jobs (community_stale_count)
  where community_stale_count > 0;

create or replace function public.recompute_job_stale_count(target_job uuid)
returns void
language sql
as $$
  update public.jobs
  set community_stale_count = (
    select count(*)
    from public.job_stale_flags
    where job_id = target_job
      and status = 'open'
  )
  where id = target_job;
$$;

create or replace function public.trg_job_stale_flags_recount()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_job_stale_count(old.job_id);
    return old;
  end if;

  perform public.recompute_job_stale_count(new.job_id);
  if tg_op = 'UPDATE' and old.job_id is distinct from new.job_id then
    perform public.recompute_job_stale_count(old.job_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_stale_flags_recount on public.job_stale_flags;
create trigger trg_job_stale_flags_recount
  after insert or update or delete on public.job_stale_flags
  for each row execute function public.trg_job_stale_flags_recount();

-- RLS
alter table public.job_stale_flags enable row level security;

drop policy if exists "members can insert their own stale flags"
  on public.job_stale_flags;
create policy "members can insert their own stale flags"
  on public.job_stale_flags
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "reporters can read their own stale flags"
  on public.job_stale_flags;
create policy "reporters can read their own stale flags"
  on public.job_stale_flags
  for select
  to authenticated
  using (reporter_id = auth.uid());

-- Admin reads / updates go through service-role API routes; no broad admin
-- policy is needed at the table level. (Mirrors how other admin queues like
-- failed_auth_reports gate access via API + service role.)

commit;
