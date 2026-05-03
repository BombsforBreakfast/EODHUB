-- Public beta waitlist (login page gate). Anonymous users may insert one row per email (case-insensitive).

begin;

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  service text,
  created_at timestamptz not null default now()
);

comment on table public.waitlist_signups is
  'Early-access waitlist signups from the login beta gate; anon insert, admin read.';

create unique index if not exists waitlist_signups_email_lower_unique
  on public.waitlist_signups (lower(btrim(email)));

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);

alter table public.waitlist_signups enable row level security;

drop policy if exists waitlist_signups_insert_public on public.waitlist_signups;
create policy waitlist_signups_insert_public
  on public.waitlist_signups
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists waitlist_signups_select_admin on public.waitlist_signups;
create policy waitlist_signups_select_admin
  on public.waitlist_signups
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

commit;
