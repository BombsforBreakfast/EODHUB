begin;

-- Audit hardening: tighten broad grants/policies found during RLS review.

-- 1) Kangaroo close RPC should be service-only (cron/maintenance), not client callable.
revoke all on function public.close_expired_kangaroo_courts() from authenticated;
grant execute on function public.close_expired_kangaroo_courts() to service_role;

-- 2) Event attendance should not be globally readable.
drop policy if exists "event_attendance_select_all" on public.event_attendance;
create policy "event_attendance_select_own"
  on public.event_attendance
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 3) Court vote rows should only be visible to the voter.
drop policy if exists "kangaroo_court_votes_select_authenticated" on public.kangaroo_court_votes;
create policy "kangaroo_court_votes_select_own"
  on public.kangaroo_court_votes
  for select
  to authenticated
  using (auth.uid() = user_id);

-- 4) RabbitHole thread tag writes must be tied to thread owner.
drop policy if exists rabbithole_thread_tags_insert_authenticated on public.rabbithole_thread_tags;
create policy rabbithole_thread_tags_insert_own_thread
on public.rabbithole_thread_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.rabbithole_threads t
    where t.id = thread_id
      and t.author_id = auth.uid()
  )
);

drop policy if exists rabbithole_thread_tags_delete_authenticated on public.rabbithole_thread_tags;
create policy rabbithole_thread_tags_delete_own_thread
on public.rabbithole_thread_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.rabbithole_threads t
    where t.id = thread_id
      and t.author_id = auth.uid()
  )
);

-- 5) RabbitHole contribution tag writes must be tied to contribution owner.
drop policy if exists rabbithole_contribution_tags_insert_authenticated on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_insert_own_contribution
on public.rabbithole_contribution_tags
for insert
to authenticated
with check (
  exists (
    select 1
    from public.rabbithole_contributions c
    where c.id = contribution_id
      and c.created_by = auth.uid()
  )
);

drop policy if exists rabbithole_contribution_tags_delete_authenticated on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_delete_own_contribution
on public.rabbithole_contribution_tags
for delete
to authenticated
using (
  exists (
    select 1
    from public.rabbithole_contributions c
    where c.id = contribution_id
      and c.created_by = auth.uid()
  )
);

-- 6) Storage object reads should mirror rabbithole_assets contribution visibility.
drop policy if exists rabbithole_assets_read_authenticated on storage.objects;
create policy rabbithole_assets_read_authenticated
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rabbithole-assets'
  and exists (
    select 1
    from public.rabbithole_assets a
    join public.rabbithole_contributions c
      on c.id = a.contribution_id
    where a.bucket = 'rabbithole-assets'
      and a.object_key = storage.objects.name
      and (c.status = 'active' or c.created_by = auth.uid())
  )
);

commit;
