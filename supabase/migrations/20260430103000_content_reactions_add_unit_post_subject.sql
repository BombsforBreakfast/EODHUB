begin;

-- Add unit_post as a first-class reaction subject for group wall posts.
alter table public.content_reactions drop constraint if exists content_reactions_subject_kind_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in ('post', 'post_comment', 'unit_post', 'unit_post_comment', 'event', 'event_comment')
);

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post, post_comment, unit_post, unit_post_comment, event, event_comment, ...).';

commit;
