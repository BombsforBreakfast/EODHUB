-- Mirror Auth identity onto public.profiles so admins can see who requested access
-- from the Table Editor (user_id / profiles) without joining auth.users.

begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists name text;

comment on column public.profiles.email is
  'Primary sign-in email from auth.users, mirrored for admin visibility in Table Editor.';
comment on column public.profiles.name is
  'Best-effort display name from Auth metadata or profile first/last name, mirrored for admin visibility.';

-- Backfill existing rows from Auth + profile names
update public.profiles p
set
  email = coalesce(p.email, u.email),
  name = coalesce(
    nullif(
      trim(
        both
        from coalesce(
          u.raw_user_meta_data ->> 'full_name',
          u.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    ),
    nullif(trim(both from concat_ws(' ', p.first_name, p.last_name)), ''),
    p.name
  )
from auth.users u
where u.id = p.user_id;

-- When Auth user email or OAuth metadata changes, push into profiles (if row exists).
create or replace function public.trg_auth_user_mirror_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_name text;
begin
  meta_name := nullif(
    trim(
      both
      from coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        ''
      )
    ),
    ''
  );

  update public.profiles
  set
    email = new.email,
    name = coalesce(
      meta_name,
      nullif(trim(both from concat_ws(' ', first_name, last_name)), ''),
      name
    )
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_auth_user_mirror_profile_identity on auth.users;

create trigger trg_auth_user_mirror_profile_identity
  after insert or update of email, raw_user_meta_data on auth.users
  for each row
  execute function public.trg_auth_user_mirror_profile_identity();

-- On every profiles write, refresh mirror from Auth (covers profile row created after Auth user).
create or replace function public.trg_profiles_mirror_identity_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  auth_email text;
  auth_meta_name text;
begin
  select
    u.email,
    nullif(
      trim(
        both
        from coalesce(
          u.raw_user_meta_data ->> 'full_name',
          u.raw_user_meta_data ->> 'name',
          ''
        )
      ),
      ''
    )
  into auth_email, auth_meta_name
  from auth.users u
  where u.id = new.user_id;

  if auth_email is not null then
    new.email := auth_email;
  end if;

  new.name := coalesce(
    auth_meta_name,
    nullif(trim(both from concat_ws(' ', new.first_name, new.last_name)), ''),
    new.name
  );

  return new;
end;
$$;

drop trigger if exists trg_profiles_mirror_identity_from_auth on public.profiles;

create trigger trg_profiles_mirror_identity_from_auth
  before insert or update on public.profiles
  for each row
  execute function public.trg_profiles_mirror_identity_from_auth();

commit;
