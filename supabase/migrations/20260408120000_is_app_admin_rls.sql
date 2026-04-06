-- Aligns database RLS with app-level god mode for profiles.is_admin = true.
-- Run via Supabase CLI or paste into the SQL editor.
--
-- How it works:
-- - public.is_app_admin() reads your own profiles row (SECURITY DEFINER, fixed search_path).
-- - Extra PERMISSIVE policies OR with your existing member policies so admins pass RLS
--   for SELECT/INSERT/UPDATE/DELETE on the listed tables.
-- - If a table is missing in your project, comment out or delete those lines.
-- - If RLS is not enabled on a table yet, these policies are inert until you enable RLS.

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin
     from public.profiles p
     where p.user_id = (select auth.uid())),
    false
  );
$$;

comment on function public.is_app_admin() is
  'True when the signed-in user has profiles.is_admin (QA / operations bypass for RLS).';

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.is_app_admin() to service_role;

-- === Tables used from the Next.js app (adjust if your schema differs) ===

drop policy if exists app_admin_full_access on public.profiles;
create policy app_admin_full_access on public.profiles
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.units;
create policy app_admin_full_access on public.units
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.unit_members;
create policy app_admin_full_access on public.unit_members
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.unit_posts;
create policy app_admin_full_access on public.unit_posts
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.unit_post_likes;
create policy app_admin_full_access on public.unit_post_likes
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.unit_post_comments;
create policy app_admin_full_access on public.unit_post_comments
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.unit_join_approvals;
create policy app_admin_full_access on public.unit_join_approvals
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.jobs;
create policy app_admin_full_access on public.jobs
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.posts;
create policy app_admin_full_access on public.posts
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.post_comments;
create policy app_admin_full_access on public.post_comments
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.post_likes;
create policy app_admin_full_access on public.post_likes
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.post_comment_likes;
create policy app_admin_full_access on public.post_comment_likes
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.post_images;
create policy app_admin_full_access on public.post_images
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.notifications;
create policy app_admin_full_access on public.notifications
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.conversations;
create policy app_admin_full_access on public.conversations
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.messages;
create policy app_admin_full_access on public.messages
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.profile_vouches;
create policy app_admin_full_access on public.profile_vouches
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.profile_connections;
create policy app_admin_full_access on public.profile_connections
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.saved_jobs;
create policy app_admin_full_access on public.saved_jobs
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.flags;
create policy app_admin_full_access on public.flags
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.memorials;
create policy app_admin_full_access on public.memorials
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.memorial_likes;
create policy app_admin_full_access on public.memorial_likes
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.memorial_comments;
create policy app_admin_full_access on public.memorial_comments
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.business_listings;
create policy app_admin_full_access on public.business_listings
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists app_admin_full_access on public.business_likes;
create policy app_admin_full_access on public.business_likes
  for all to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- Optional: Storage (bucket "feed-images" — match app usage). Enable if you use RLS on storage.objects.
-- drop policy if exists "app_admin_feed_images_all" on storage.objects;
-- create policy "app_admin_feed_images_all"
--   on storage.objects for all to authenticated
--   using (bucket_id = 'feed-images' and public.is_app_admin())
--   with check (bucket_id = 'feed-images' and public.is_app_admin());
