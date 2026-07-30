-- Direct email → auth.users lookup for admin/service-role code.
-- Replaces GoTrue listUsers pagination, which fails mid-scan on larger projects
-- ("Database error finding users") and cannot see older accounts reliably.

create or replace function public.find_auth_user_ids_by_email(p_email text)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public, auth
as $$
  with normalized as (
    select lower(trim(p_email)) as email
  )
  select distinct u.id as user_id
  from auth.users u
  cross join normalized n
  where u.deleted_at is null
    and (
      lower(u.email) = n.email
      or exists (
        select 1
        from public.auth_login_email_aliases a
        where a.user_id = u.id
          and a.alias_email = n.email
      )
    );
$$;

revoke all on function public.find_auth_user_ids_by_email(text) from public;
grant execute on function public.find_auth_user_ids_by_email(text) to service_role;

comment on function public.find_auth_user_ids_by_email(text) is
  'Service-role O(1) auth.users email lookup; avoids GoTrue listUsers pagination.';
