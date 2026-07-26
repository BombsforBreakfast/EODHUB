-- Collapsing Circuit: allow authors to edit their own live posts.

begin;

drop policy if exists circuit_posts_update_own on public.circuit_posts;
create policy circuit_posts_update_own
  on public.circuit_posts
  for update
  to authenticated
  using (user_id = auth.uid() and expires_at > now())
  with check (user_id = auth.uid() and expires_at > now());

commit;
