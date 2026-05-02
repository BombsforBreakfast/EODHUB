begin;

-- Extend polymorphic reactions to post comments and unit forum comments.
alter table public.content_reactions drop constraint content_reactions_subject_kind_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in ('post', 'post_comment', 'unit_post_comment')
);

-- Backfill legacy post_comment_likes → content_reactions (reaction_type like)
insert into public.content_reactions (subject_kind, subject_id, user_id, reaction_type, created_at, updated_at)
select 'post_comment'::text, pcl.comment_id, pcl.user_id, 'like'::text, now(), now()
from public.post_comment_likes pcl
on conflict (subject_kind, subject_id, user_id) do nothing;

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post → posts.id, post_comment → post_comments.id, unit_post_comment → unit_post_comments.id).';

commit;
