begin;

-- Repair migration to reconcile constraint drift across environments.
-- Ensures all currently-supported subject kinds and reaction types are accepted.

alter table public.content_reactions drop constraint if exists content_reactions_subject_kind_check;
alter table public.content_reactions drop constraint if exists content_reactions_reaction_type_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in ('post', 'post_comment', 'unit_post', 'unit_post_comment', 'event', 'event_comment')
);

alter table public.content_reactions add constraint content_reactions_reaction_type_check check (
  reaction_type in (
    'like',
    'dislike',
    'rock_on',
    'silva',
    'strong',
    'fire',
    'bomb',
    'whiskey',
    'smoke',
    'laugh',
    'sad',
    'respect'
  )
);

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post, post_comment, unit_post, unit_post_comment, event, event_comment, ...).';

commit;
