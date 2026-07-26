-- Optional photo attachments on ephemeral Team Room messages.

begin;

alter table public.chatroom_messages
  add column if not exists image_url text;

comment on column public.chatroom_messages.image_url is
  'Optional uploaded photo URL attached to the message (feed-images storage).';

alter table public.chatroom_messages
  drop constraint if exists chatroom_messages_body_len;

alter table public.chatroom_messages
  add constraint chatroom_messages_body_len
  check (
    (
      (gif_url is not null or image_url is not null)
      and char_length(coalesce(body, '')) between 0 and 2000
    )
    or char_length(body) between 1 and 2000
  );

alter table public.chatroom_flag_snapshots
  add column if not exists image_url text;

commit;
