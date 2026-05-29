-- Add one-level (Facebook-style) replies to feed comments.
-- Replies are ordinary post_comments rows whose parent_comment_id points at a
-- top-level comment. Deleting a top-level comment cascades to its replies.
alter table public.post_comments
  add column if not exists parent_comment_id uuid
  references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_comment_id_idx
  on public.post_comments (parent_comment_id);
