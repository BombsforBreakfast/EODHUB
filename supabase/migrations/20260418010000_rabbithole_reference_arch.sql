-- Rabbithole Reference Architecture migration
-- 1. Delete all manual threads (no originating feed post) and their dependencies.
-- 2. Make body nullable — it becomes an optional Curator's Note, not a content copy.
-- 3. Add source_type so the detail page knows which table to fetch live content from.
-- 4. Add promoted_from_unit_post_id so unit-forum posts can be promoted.
-- 5. Add rabbithole_thread_id to unit_posts to mark a post as filed.

-- ── Step 1: clean up manual threads ─────────────────────────────────────────

delete from public.rabbithole_thread_tags
  where thread_id in (
    select id from public.rabbithole_threads
    where promoted_from_post_id is null
  );

delete from public.rabbithole_replies
  where thread_id in (
    select id from public.rabbithole_threads
    where promoted_from_post_id is null
  );

delete from public.rabbithole_threads
  where promoted_from_post_id is null;

-- ── Step 2: make body nullable (becomes Curator's Note) ─────────────────────

alter table public.rabbithole_threads
  alter column body drop not null;

-- ── Step 3: source_type — 'feed' or 'unit' ──────────────────────────────────

alter table public.rabbithole_threads
  add column if not exists source_type text not null default 'feed';

update public.rabbithole_threads
  set source_type = 'feed'
  where source_type is null or source_type = '';

-- ── Step 4: unit post reference ──────────────────────────────────────────────

alter table public.rabbithole_threads
  add column if not exists promoted_from_unit_post_id uuid
    references public.unit_posts(id) on delete set null;

create index if not exists rabbithole_threads_unit_post_idx
  on public.rabbithole_threads (promoted_from_unit_post_id)
  where promoted_from_unit_post_id is not null;

-- ── Step 5: mark unit_posts as filed ─────────────────────────────────────────

alter table public.unit_posts
  add column if not exists rabbithole_thread_id uuid
    references public.rabbithole_threads(id) on delete set null;

create index if not exists unit_posts_rabbithole_thread_id_idx
  on public.unit_posts (rabbithole_thread_id)
  where rabbithole_thread_id is not null;
