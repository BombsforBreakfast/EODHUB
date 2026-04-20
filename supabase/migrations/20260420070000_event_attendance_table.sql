begin;

-- Missing RSVP table used across feed + events page.
create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('interested', 'going')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists idx_event_attendance_event_id
  on public.event_attendance (event_id);

create index if not exists idx_event_attendance_user_id
  on public.event_attendance (user_id);

-- Keep updated_at current on status changes.
create or replace function public._touch_event_attendance_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_event_attendance_touch_updated_at on public.event_attendance;
create trigger trg_event_attendance_touch_updated_at
  before update on public.event_attendance
  for each row
  execute function public._touch_event_attendance_updated_at();

alter table public.event_attendance enable row level security;

drop policy if exists "event_attendance_select_all" on public.event_attendance;
create policy "event_attendance_select_all"
  on public.event_attendance
  for select
  to anon, authenticated
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

commit;
