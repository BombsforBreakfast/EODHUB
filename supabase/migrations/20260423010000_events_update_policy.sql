-- Fix: events had no UPDATE RLS policy, so every
-- `supabase.from("events").update(...)` from the admin or owner UI silently
-- affected 0 rows — Supabase reports success and the next reload shows the
-- original date/title/etc. (Same pathology as the memorials reversion bug
-- fixed in 20260422160000_memorials_update_policy.sql.)
--
-- Add:
--   1. events_update_owner — the row's creator can edit their own event.
--   2. events_admin_all     — any profile with is_admin = true can do anything
--      on events (used by the moderation surface in /admin).

alter table public.events enable row level security;

drop policy if exists events_update_owner on public.events;
create policy events_update_owner
  on public.events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists events_admin_all on public.events;
create policy events_admin_all
  on public.events
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );
