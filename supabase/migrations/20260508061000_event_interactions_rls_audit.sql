begin;

alter table if exists public.event_attendance enable row level security;
alter table if exists public.saved_events enable row level security;

-- Attendance counts are shown to signed-in members in feed/events surfaces.
drop policy if exists "event_attendance_select_all" on public.event_attendance;
drop policy if exists "event_attendance_select_authenticated" on public.event_attendance;
create policy "event_attendance_select_authenticated"
  on public.event_attendance
  for select
  to authenticated
  using (true);

drop policy if exists "event_attendance_insert_own" on public.event_attendance;
create policy "event_attendance_insert_own"
  on public.event_attendance
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "event_attendance_update_own" on public.event_attendance;
create policy "event_attendance_update_own"
  on public.event_attendance
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "event_attendance_delete_own" on public.event_attendance;
create policy "event_attendance_delete_own"
  on public.event_attendance
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Saved events should always be scoped to the authenticated owner.
drop policy if exists "saved_events_select_own" on public.saved_events;
create policy "saved_events_select_own"
  on public.saved_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "saved_events_insert_own" on public.saved_events;
create policy "saved_events_insert_own"
  on public.saved_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "saved_events_update_own" on public.saved_events;
create policy "saved_events_update_own"
  on public.saved_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "saved_events_delete_own" on public.saved_events;
create policy "saved_events_delete_own"
  on public.saved_events
  for delete
  to authenticated
  using (auth.uid() = user_id);

commit;
