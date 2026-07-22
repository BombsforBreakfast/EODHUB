-- Allow longer chatroom bodies so @[Name](uuid) mention tokens fit within the limit
-- while display text stays ~500 chars.

begin;

alter table public.chatroom_messages
  drop constraint if exists chatroom_messages_body_len;

alter table public.chatroom_messages
  add constraint chatroom_messages_body_len
  check (char_length(body) between 1 and 2000);

commit;
