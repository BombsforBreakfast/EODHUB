-- Collapsing Circuit: optional overlay title on strip tiles.

begin;

alter table public.circuit_posts
  add column if not exists title text null;

alter table public.circuit_posts
  drop constraint if exists circuit_posts_title_len;

alter table public.circuit_posts
  add constraint circuit_posts_title_len check (
    title is null or char_length(title) between 1 and 80
  );

comment on column public.circuit_posts.title is
  'Optional strip overlay title (shown on the tile like a prompt label).';

commit;
