alter table public.memorials
  add column if not exists category text not null default 'military'
  check (category in ('military', 'leo_fed'));

create index if not exists memorials_category_idx
  on public.memorials (category);
