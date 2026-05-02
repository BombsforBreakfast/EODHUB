begin;

-- Add two new reaction types:
-- rock_on -> 🤘
-- silva   -> 🤙 ("The Silva")
alter table public.content_reactions drop constraint if exists content_reactions_reaction_type_check;

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

commit;
