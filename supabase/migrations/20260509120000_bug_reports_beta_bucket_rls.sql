-- Beta bug reports: schema extensions, RLS, and screenshot storage.

-- ---------------------------------------------------------------------------
-- bug_reports table (ensure exists + columns)
-- ---------------------------------------------------------------------------

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  message text,
  screenshot_url text,
  page_url text,
  reviewed boolean not null default false
);

alter table public.bug_reports add column if not exists title text;
alter table public.bug_reports add column if not exists description text;
alter table public.bug_reports add column if not exists user_agent text;
alter table public.bug_reports add column if not exists admin_notes text;
alter table public.bug_reports add column if not exists status text;

-- Backfill description from legacy message
update public.bug_reports
set description = coalesce(description, message)
where description is null;

update public.bug_reports
set status = case when coalesce(reviewed, false) then 'fixed' else 'new' end
where status is null;

alter table public.bug_reports
  alter column status set default 'new';

update public.bug_reports set status = 'new' where status is null or status = '';

alter table public.bug_reports
  alter column status set not null;

alter table public.bug_reports drop constraint if exists bug_reports_status_check;
alter table public.bug_reports add constraint bug_reports_status_check
  check (status in ('new', 'reviewing', 'fixed', 'ignored'));

create index if not exists bug_reports_created_at_idx on public.bug_reports (created_at desc);
create index if not exists bug_reports_status_idx on public.bug_reports (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.bug_reports enable row level security;

drop policy if exists bug_reports_insert_own on public.bug_reports;
create policy bug_reports_insert_own
  on public.bug_reports
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists bug_reports_select_admin on public.bug_reports;
create policy bug_reports_select_admin
  on public.bug_reports
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists bug_reports_update_admin on public.bug_reports;
create policy bug_reports_update_admin
  on public.bug_reports
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists bug_reports_delete_admin on public.bug_reports;
create policy bug_reports_delete_admin
  on public.bug_reports
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: bug-report-screenshots (public read; users upload under own folder)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('bug-report-screenshots', 'bug-report-screenshots', true)
on conflict (id) do nothing;

drop policy if exists bug_report_screenshots_public_read on storage.objects;
create policy bug_report_screenshots_public_read
  on storage.objects
  for select
  using (bucket_id = 'bug-report-screenshots');

drop policy if exists bug_report_screenshots_insert_own on storage.objects;
create policy bug_report_screenshots_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'bug-report-screenshots'
    and split_part(name, '/', 1) = auth.uid()::text
    and array_length(string_to_array(trim(name), '/'), 1) = 2
  );

drop policy if exists bug_report_screenshots_delete_own on storage.objects;
create policy bug_report_screenshots_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'bug-report-screenshots'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists bug_report_screenshots_admin_all on storage.objects;
create policy bug_report_screenshots_admin_all
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'bug-report-screenshots'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  )
  with check (
    bucket_id = 'bug-report-screenshots'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );
