begin;

-- Security audit trail for sensitive route decisions/actions.
-- Inserted by server-side service-role flows only.

create table if not exists public.security_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  route text not null,
  action text not null,
  outcome text not null check (outcome in ('allow', 'deny', 'error')),
  http_status int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_audit_events_created_at
  on public.security_audit_events (created_at desc);
create index if not exists idx_security_audit_events_actor
  on public.security_audit_events (actor_user_id, created_at desc);
create index if not exists idx_security_audit_events_route
  on public.security_audit_events (route, created_at desc);
create index if not exists idx_security_audit_events_outcome
  on public.security_audit_events (outcome, created_at desc);

alter table public.security_audit_events enable row level security;

-- Restrict read access to admins only.
drop policy if exists "security_audit_events_admin_select" on public.security_audit_events;
create policy "security_audit_events_admin_select"
  on public.security_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.user_id = auth.uid()
        and coalesce(p.is_admin, false)
    )
  );

commit;

