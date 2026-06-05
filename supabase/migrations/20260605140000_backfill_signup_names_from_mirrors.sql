-- Backfill first_name / last_name from mirrored OAuth name fields where admins
-- can see a full name but approval was blocked on empty name columns.

begin;

update public.profiles p
set
  first_name = split_part(trim(p.name), ' ', 1),
  last_name = nullif(
    trim(substring(trim(p.name) from position(' ' in trim(p.name)) + 1)),
    ''
  )
where nullif(trim(coalesce(p.first_name, '')), '') is null
  and nullif(trim(coalesce(p.last_name, '')), '') is null
  and nullif(trim(coalesce(p.name, '')), '') is not null
  and position(' ' in trim(p.name)) > 0;

update public.profiles p
set
  first_name = split_part(trim(p.display_name), ' ', 1),
  last_name = nullif(
    trim(substring(trim(p.display_name) from position(' ' in trim(p.display_name)) + 1)),
    ''
  )
where nullif(trim(coalesce(p.first_name, '')), '') is null
  and nullif(trim(coalesce(p.last_name, '')), '') is null
  and nullif(trim(coalesce(p.display_name, '')), '') is not null
  and position(' ' in trim(p.display_name)) > 0;

commit;
