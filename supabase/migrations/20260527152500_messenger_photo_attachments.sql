-- Messenger photo attachments.
-- Photos are stored in the existing public feed-images bucket and referenced
-- from messages so they work with realtime inserts and existing conversation RLS.

alter table public.messages
  add column if not exists image_url text;

comment on column public.messages.image_url is
  'Optional public image URL for a messenger photo attachment.';
