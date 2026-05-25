-- Allow users to delete their own notification rows (dismiss / open-to-clear).
-- Previously only SELECT + UPDATE existed, so client .delete() was blocked by RLS.
begin;

drop policy if exists "Users delete own notifications" on public.notifications;

create policy "Users delete own notifications"
  on public.notifications
  for delete
  using (user_id = auth.uid());

commit;
