-- Fix: restrict app_admin RLS on profiles to SELECT only.
-- The previous "for all" policy allowed any admin (via their user-jwt client) to UPDATE
-- arbitrary profile rows, including setting is_admin = true on other accounts.
-- All admin profile mutations in the app use the service_role client directly,
-- which bypasses RLS entirely — so this SELECT-only policy loses nothing.

drop policy if exists app_admin_full_access on public.profiles;

create policy app_admin_profiles_select on public.profiles
  for select to authenticated
  using (public.is_app_admin());
