-- Fix: memorials had no UPDATE RLS policy, so every
-- `supabase.from("memorials").update(...)` from the admin UI silently affected
-- 0 rows — Supabase reports success and then the next reload shows the
-- original photo_url/bio/etc., making manual photo edits appear to "revert".
--
-- Add:
--   1. memorials_update_owner — the row's creator can edit their own memorial
--      (mirrors the existing insert/delete policies).
--   2. memorials_admin_all — any profile with is_admin = true can do anything
--      on memorials, matching the moderation pattern used across the app
--      (see 20260419130000_rabbithole_moderation.sql).

alter table public.memorials enable row level security;

drop policy if exists memorials_update_owner on public.memorials;
create policy memorials_update_owner
  on public.memorials
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists memorials_admin_all on public.memorials;
create policy memorials_admin_all
  on public.memorials
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.is_admin = true
    )
  );
