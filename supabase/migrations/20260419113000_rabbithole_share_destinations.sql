-- RabbitHole share-routing support for feed, user walls, and unit walls.
-- Adds explicit provenance fields so destination posts can render
-- "Shared from RabbitHole" consistently.

alter table public.posts
  add column if not exists rabbithole_contribution_id uuid
    references public.rabbithole_contributions(id) on delete set null;

alter table public.posts
  add column if not exists shared_from_rabbithole boolean not null default false;

create index if not exists posts_rabbithole_contribution_id_idx
  on public.posts (rabbithole_contribution_id)
  where rabbithole_contribution_id is not null;

alter table public.unit_posts
  add column if not exists rabbithole_contribution_id uuid
    references public.rabbithole_contributions(id) on delete set null;

alter table public.unit_posts
  add column if not exists shared_from_rabbithole boolean not null default false;

create index if not exists unit_posts_rabbithole_contribution_id_idx
  on public.unit_posts (rabbithole_contribution_id)
  where rabbithole_contribution_id is not null;
