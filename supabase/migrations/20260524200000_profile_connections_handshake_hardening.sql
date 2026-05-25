begin;

-- Side-specific worked-with flags. The legacy `worked_with` column remains as
-- an aggregate compatibility flag for existing UI/feed code while the app moves
-- to viewer-specific worked-with semantics.
alter table public.profile_connections
  add column if not exists requester_worked_with_target boolean not null default false,
  add column if not exists target_worked_with_requester boolean not null default false,
  add column if not exists requester_worked_with_at timestamptz,
  add column if not exists target_worked_with_at timestamptz;

update public.profile_connections
set
  status = coalesce(status, 'accepted'),
  requester_worked_with_target = requester_worked_with_target or worked_with,
  target_worked_with_requester = target_worked_with_requester or worked_with,
  requester_worked_with_at = case
    when worked_with and requester_worked_with_at is null then coalesce(responded_at, updated_at, created_at, now())
    else requester_worked_with_at
  end,
  target_worked_with_at = case
    when worked_with and target_worked_with_at is null then coalesce(responded_at, updated_at, created_at, now())
    else target_worked_with_at
  end,
  updated_at = now()
where status is null
   or worked_with
   or requester_worked_with_target
   or target_worked_with_requester;

-- The original v2 refactor treated every legacy `connection_type = 'know'`
-- row as accepted. For the handshake model, an old one-way Know click should
-- remain pending until the target reciprocates. Preserve accepted rows that
-- have explicit response metadata or any worked-with signal.
update public.profile_connections
set
  status = 'pending',
  responded_at = null,
  responded_by_user_id = null,
  requester_worked_with_target = false,
  target_worked_with_requester = false,
  requester_worked_with_at = null,
  target_worked_with_at = null,
  worked_with = false,
  updated_at = now()
where connection_type = 'know'
  and status = 'accepted'
  and worked_with = false
  and requester_worked_with_target = false
  and target_worked_with_requester = false
  and responded_by_user_id is null
  and responded_at is null;

alter table public.profile_connections
  alter column status set default 'pending',
  alter column status set not null;

alter table public.profile_connections
  drop constraint if exists profile_connections_side_worked_with_requires_accepted;

alter table public.profile_connections
  add constraint profile_connections_side_worked_with_requires_accepted
  check (
    (
      not requester_worked_with_target
      and requester_worked_with_at is null
      and not target_worked_with_requester
      and target_worked_with_at is null
    )
    or status = 'accepted'
  );

create or replace function public.profile_connections_sync_handshake_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'accepted' then
    new.requester_worked_with_target := false;
    new.target_worked_with_requester := false;
    new.requester_worked_with_at := null;
    new.target_worked_with_at := null;
  end if;

  if new.requester_worked_with_target and new.requester_worked_with_at is null then
    new.requester_worked_with_at := now();
  elsif not new.requester_worked_with_target then
    new.requester_worked_with_at := null;
  end if;

  if new.target_worked_with_requester and new.target_worked_with_at is null then
    new.target_worked_with_at := now();
  elsif not new.target_worked_with_requester then
    new.target_worked_with_at := null;
  end if;

  new.worked_with := new.requester_worked_with_target or new.target_worked_with_requester;
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists trg_profile_connections_sync_handshake_columns on public.profile_connections;
create trigger trg_profile_connections_sync_handshake_columns
before insert or update on public.profile_connections
for each row execute function public.profile_connections_sync_handshake_columns();

comment on column public.profile_connections.requester_worked_with_target is
  'True when requester_user_id has marked target_user_id as worked-with.';
comment on column public.profile_connections.target_worked_with_requester is
  'True when target_user_id has marked requester_user_id as worked-with.';
comment on column public.profile_connections.worked_with is
  'Aggregate compatibility flag: requester_worked_with_target OR target_worked_with_requester.';

-- Remove broad legacy policies that let browser clients spoof accepted rows or
-- mutate the other participant's side of the relationship. Connection writes now
-- go through /api/profile-connections/action using authenticated service-role
-- logic; client SELECT remains participant-scoped.
drop policy if exists "Anyone signed in can read profile connections" on public.profile_connections;
drop policy if exists "Users can insert their own profile connections" on public.profile_connections;
drop policy if exists "Users can delete their own profile connections" on public.profile_connections;
drop policy if exists profile_connections_insert_requester_pending on public.profile_connections;
drop policy if exists profile_connections_update_participant on public.profile_connections;
drop policy if exists profile_connections_delete_requester on public.profile_connections;

commit;
