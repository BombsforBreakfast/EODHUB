-- Availability is managed by the owner admin API. Browsers cannot access this table directly.
create table if not exists public.rental_listing_status (
  listing_id text primary key,
  status text not null check (status in ('available-now', 'pending', 'unavailable')),
  projected_availability_date date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.rental_listing_status enable row level security;
revoke all on public.rental_listing_status from public, anon, authenticated;
grant select, insert, update, delete on public.rental_listing_status to service_role;
insert into public.rental_listing_status (listing_id, status, updated_at) values
  ('1186-muirfield-way', 'available-now', '2026-10-20T00:00:00Z'),
  ('4276-calinda-158', 'pending', '2026-10-24T00:00:00Z'),
  ('4726-calinda-139', 'available-now', '2026-10-24T00:00:00Z')
on conflict (listing_id) do nothing;
