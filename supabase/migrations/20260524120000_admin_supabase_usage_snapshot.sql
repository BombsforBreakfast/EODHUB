-- Admin-only usage snapshot for Infrastructure monitoring in the admin panel.
-- Callable via service_role from /api/admin/supabase-usage only.

begin;

create or replace function public.admin_supabase_usage_snapshot()
returns json
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  db_bytes bigint;
  storage_bytes bigint;
  profile_count bigint;
  auth_mau_approx bigint;
begin
  select pg_database_size(current_database()) into db_bytes;

  select coalesce(sum((metadata->>'size')::bigint), 0)::bigint
  into storage_bytes
  from storage.objects;

  select count(*)::bigint into profile_count from public.profiles;

  select count(*)::bigint
  into auth_mau_approx
  from auth.users
  where coalesce(last_sign_in_at, created_at) >= (now() at time zone 'utc') - interval '30 days';

  return json_build_object(
    'database_bytes', db_bytes,
    'storage_bytes', storage_bytes,
    'registered_profiles', profile_count,
    'auth_mau_approx', auth_mau_approx,
    'captured_at', (now() at time zone 'utc')
  );
end;
$$;

revoke all on function public.admin_supabase_usage_snapshot() from public;
revoke all on function public.admin_supabase_usage_snapshot() from anon;
revoke all on function public.admin_supabase_usage_snapshot() from authenticated;
grant execute on function public.admin_supabase_usage_snapshot() to service_role;

comment on function public.admin_supabase_usage_snapshot() is
  'Returns DB size, storage object bytes, profile count, and approximate 30d auth MAU. Service-role API only.';

commit;
