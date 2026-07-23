-- Allow authors to edit their own Team Room messages.

begin;

drop policy if exists chatroom_messages_update_own on public.chatroom_messages;
create policy chatroom_messages_update_own
  on public.chatroom_messages
  for update
  to authenticated
  using (user_id = auth.uid() and expires_at > now())
  with check (user_id = auth.uid() and expires_at > now());

commit;
