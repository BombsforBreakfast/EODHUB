begin;

alter table public.events
  add column if not exists unit_id uuid references public.units(id) on delete cascade,
  add column if not exists visibility text not null default 'public';

alter table public.events
  drop constraint if exists events_visibility_check,
  add constraint events_visibility_check
    check (visibility in ('public', 'group'));

create index if not exists idx_events_unit_id
  on public.events(unit_id);

create index if not exists idx_events_visibility_date
  on public.events(visibility, date);

create index if not exists idx_events_unit_date
  on public.events(unit_id, date)
  where unit_id is not null;

alter table public.events enable row level security;

drop policy if exists events_select_visible on public.events;
create policy events_select_visible
  on public.events
  for select
  to anon, authenticated
  using (
    (coalesce(visibility, 'public') = 'public' and unit_id is null)
    or (
      auth.role() = 'authenticated'
      and coalesce(visibility, 'public') = 'group'
      and unit_id is not null
      and exists (
        select 1
        from public.unit_members um
        where um.unit_id = events.unit_id
          and um.user_id = auth.uid()
          and um.status = 'approved'
      )
    )
  );

drop policy if exists events_insert_member_or_public_owner on public.events;
create policy events_insert_member_or_public_owner
  on public.events
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      (coalesce(visibility, 'public') = 'public' and unit_id is null)
      or (
        coalesce(visibility, 'public') = 'group'
        and unit_id is not null
        and exists (
          select 1
          from public.unit_members um
          where um.unit_id = events.unit_id
            and um.user_id = auth.uid()
            and um.status = 'approved'
        )
      )
    )
  );

drop policy if exists event_attendance_select_visible_event on public.event_attendance;
create policy event_attendance_select_visible_event
  on public.event_attendance
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and (
          (coalesce(e.visibility, 'public') = 'public' and e.unit_id is null)
          or (
            coalesce(e.visibility, 'public') = 'group'
            and e.unit_id is not null
            and exists (
              select 1
              from public.unit_members um
              where um.unit_id = e.unit_id
                and um.user_id = auth.uid()
                and um.status = 'approved'
            )
          )
        )
    )
  );

drop policy if exists event_attendance_insert_visible_event on public.event_attendance;
create policy event_attendance_insert_visible_event
  on public.event_attendance
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and (
          (coalesce(e.visibility, 'public') = 'public' and e.unit_id is null)
          or (
            coalesce(e.visibility, 'public') = 'group'
            and e.unit_id is not null
            and exists (
              select 1
              from public.unit_members um
              where um.unit_id = e.unit_id
                and um.user_id = auth.uid()
                and um.status = 'approved'
            )
          )
        )
    )
  );

commit;
