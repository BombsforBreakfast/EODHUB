-- RabbitHole share-routing simplification.
-- The shared_from_rabbithole boolean is redundant: the FK
-- rabbithole_contribution_id is the single source of truth for
-- "this post was shared from a RabbitHole contribution".
-- Drop the boolean from posts and unit_posts.

alter table public.posts
  drop column if exists shared_from_rabbithole;

alter table public.unit_posts
  drop column if exists shared_from_rabbithole;
