-- Allow GIF attachments on ephemeral Team Room messages (same pattern as posts/DMs).

begin;

alter table public.chatroom_messages
  add column if not exists gif_url text;

comment on column public.chatroom_messages.gif_url is
  'Optional GIPHY (or similar) image URL attached to the message.';

-- Allow empty body when a GIF is attached (GIF-only messages).
alter table public.chatroom_messages
  drop constraint if exists chatroom_messages_body_len;

alter table public.chatroom_messages
  add constraint chatroom_messages_body_len
  check (
    (
      gif_url is not null
      and char_length(coalesce(body, '')) between 0 and 2000
    )
    or char_length(body) between 1 and 2000
  );

alter table public.chatroom_flag_snapshots
  add column if not exists gif_url text;

commit;
