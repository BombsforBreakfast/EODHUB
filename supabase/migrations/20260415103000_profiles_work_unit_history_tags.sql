alter table public.profiles
  add column if not exists professional_tags text[],
  add column if not exists unit_history_tags text[];

