begin;

-- Refactor profile_connections into a mutual request/confirmation model:
-- - one canonical row per user pair
-- - status lifecycle: pending | accepted | denied
-- - worked_with as trust flag on accepted relationships

alter table public.profile_connections
  add column if not exists status text,
  add column if not exists worked_with boolean not null default false,
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by_user_id uuid,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill from legacy two-bucket model where connection_type carried meaning.
update public.profile_connections
set worked_with = true
where connection_type = 'worked_with';

update public.profile_connections
set status = coalesce(status, 'accepted');

update public.profile_connections
set status = lower(status)
where status is not null;

update public.profile_connections
set status = 'accepted'
where status not in ('pending', 'accepted', 'denied');

-- worked_with only makes sense on accepted relationships.
update public.profile_connections
set worked_with = false
where status <> 'accepted';

update public.profile_connections
set updated_at = coalesce(updated_at, created_at, now());

-- Deduplicate legacy rows per unordered pair, preserving strongest signal.
with ranked as (
  select
    id,
    row_number() over (
      partition by least(requester_user_id, target_user_id), greatest(requester_user_id, target_user_id)
      order by
        case status when 'accepted' then 0 when 'pending' then 1 else 2 end,
        worked_with desc,
        created_at asc nulls last,
        id asc
    ) as rn,
    max(case when worked_with then 1 else 0 end) over (
      partition by least(requester_user_id, target_user_id), greatest(requester_user_id, target_user_id)
    ) as pair_worked_with,
    max(case when status = 'accepted' then 1 else 0 end) over (
      partition by least(requester_user_id, target_user_id), greatest(requester_user_id, target_user_id)
    ) as pair_has_accepted,
    max(case when status = 'pending' then 1 else 0 end) over (
      partition by least(requester_user_id, target_user_id), greatest(requester_user_id, target_user_id)
    ) as pair_has_pending
  from public.profile_connections
),
canonical as (
  update public.profile_connections p
  set
    worked_with = (r.pair_worked_with = 1),
    status = case
      when r.pair_has_accepted = 1 then 'accepted'
      when r.pair_has_pending = 1 then 'pending'
      else 'denied'
    end,
    updated_at = now()
  from ranked r
  where p.id = r.id
    and r.rn = 1
  returning p.id
)
delete from public.profile_connections d
using ranked r
where d.id = r.id
  and r.rn > 1;

alter table public.profile_connections
  drop constraint if exists profile_connections_status_check;

alter table public.profile_connections
  add constraint profile_connections_status_check
  check (status in ('pending', 'accepted', 'denied'));

alter table public.profile_connections
  drop constraint if exists profile_connections_no_self_check;

alter table public.profile_connections
  add constraint profile_connections_no_self_check
  check (requester_user_id <> target_user_id);

alter table public.profile_connections
  drop constraint if exists profile_connections_worked_with_requires_accepted;

alter table public.profile_connections
  add constraint profile_connections_worked_with_requires_accepted
  check ((not worked_with) or status = 'accepted');

-- One canonical row per user pair (A<->B).
create unique index if not exists profile_connections_pair_unique_idx
  on public.profile_connections (
    least(requester_user_id, target_user_id),
    greatest(requester_user_id, target_user_id)
  );

create index if not exists profile_connections_requester_status_idx
  on public.profile_connections (requester_user_id, status);

create index if not exists profile_connections_target_status_idx
  on public.profile_connections (target_user_id, status);

create index if not exists profile_connections_status_idx
  on public.profile_connections (status);

-- Future-proofing: keep legacy column for now to avoid breaking old code paths
-- during rollout. New code should use (status, worked_with) only.
comment on column public.profile_connections.connection_type is
  'DEPRECATED: legacy two-bucket field. Use status + worked_with instead.';

comment on column public.profile_connections.status is
  'Connection lifecycle: pending, accepted, denied.';

comment on column public.profile_connections.worked_with is
  'Trust signal within accepted know relationship.';

-- RLS baseline (non-destructive). If legacy policies exist, audit and remove
-- them after app rollout so only the policies below remain.
alter table public.profile_connections enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_connections'
      and policyname = 'profile_connections_select_participant'
  ) then
    create policy profile_connections_select_participant
      on public.profile_connections
      for select
      using (
        auth.uid() is not null
        and (auth.uid() = requester_user_id or auth.uid() = target_user_id)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_connections'
      and policyname = 'profile_connections_insert_requester_pending'
  ) then
    create policy profile_connections_insert_requester_pending
      on public.profile_connections
      for insert
      with check (
        auth.uid() = requester_user_id
        and auth.uid() <> target_user_id
        and status = 'pending'
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_connections'
      and policyname = 'profile_connections_update_participant'
  ) then
    create policy profile_connections_update_participant
      on public.profile_connections
      for update
      using (
        auth.uid() is not null
        and (auth.uid() = requester_user_id or auth.uid() = target_user_id)
      )
      with check (
        auth.uid() is not null
        and (auth.uid() = requester_user_id or auth.uid() = target_user_id)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_connections'
      and policyname = 'profile_connections_delete_requester'
  ) then
    create policy profile_connections_delete_requester
      on public.profile_connections
      for delete
      using (auth.uid() = requester_user_id);
  end if;
end
$$;

commit;
