-- Collapsing Circuit: allow privileged accounts to post as EOD HUB admin.

begin;

alter table public.circuit_posts
  add column if not exists post_as_user_id uuid references auth.users (id) on delete set null;

create index if not exists circuit_posts_post_as_user_id_idx
  on public.circuit_posts (post_as_user_id)
  where post_as_user_id is not null;

comment on column public.circuit_posts.post_as_user_id is
  'Optional display author override (e.g. EOD HUB admin). Ownership/moderation still use user_id.';

commit;
