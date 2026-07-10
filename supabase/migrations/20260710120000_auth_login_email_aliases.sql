-- Maps merged duplicate signup emails to the canonical auth.users account.
create table if not exists public.auth_login_email_aliases (
  user_id uuid not null references auth.users (id) on delete cascade,
  alias_email text not null,
  created_at timestamptz not null default now(),
  constraint auth_login_email_aliases_alias_email_lowercase check (alias_email = lower(trim(alias_email))),
  constraint auth_login_email_aliases_alias_email_format check (
    alias_email ~* '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$'
  ),
  primary key (alias_email)
);

create index if not exists auth_login_email_aliases_user_id_idx
  on public.auth_login_email_aliases (user_id);

alter table public.auth_login_email_aliases enable row level security;

revoke all on table public.auth_login_email_aliases from public;

create or replace function public.resolve_auth_login_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select u.email
      from public.auth_login_email_aliases a
      join auth.users u on u.id = a.user_id
      where a.alias_email = lower(trim(p_email))
        and u.deleted_at is null
      limit 1
    ),
    lower(trim(p_email))
  );
$$;

revoke all on function public.resolve_auth_login_email(text) from public;
grant execute on function public.resolve_auth_login_email(text) to anon, authenticated, service_role;
