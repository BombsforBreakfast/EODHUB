begin;

-- Follow-up for databases that already ran the event comments migration before
-- event-level reactions were added in the app.
alter table public.content_reactions drop constraint if exists content_reactions_subject_kind_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in ('post', 'post_comment', 'unit_post_comment', 'event', 'event_comment')
);

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post, post_comment, unit_post_comment, event, event_comment, ...).';

commit;
