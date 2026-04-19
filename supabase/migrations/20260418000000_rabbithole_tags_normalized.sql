-- Add normalized_name to rabbithole_tags for robust case-insensitive dedupe.
-- Also adds rabbithole_thread_id to posts so we can mark a post as promoted.

-- Step 1: add nullable first so existing rows aren't rejected
alter table public.rabbithole_tags
  add column if not exists normalized_name text;

-- Step 2: backfill from existing name values
update public.rabbithole_tags
  set normalized_name = lower(trim(name))
  where normalized_name is null;

-- Step 3: enforce not-null now that backfill is done
alter table public.rabbithole_tags
  alter column normalized_name set not null;

-- Step 4: unique index (covers dedup) + trgm index for fuzzy search
create unique index if not exists rabbithole_tags_normalized_name_key
  on public.rabbithole_tags (normalized_name);

create index if not exists rabbithole_tags_normalized_name_trgm_idx
  on public.rabbithole_tags using gin (normalized_name gin_trgm_ops);

-- Step 5: mark posts as promoted to rabbithole
alter table public.posts
  add column if not exists rabbithole_thread_id uuid references public.rabbithole_threads(id);

create index if not exists posts_rabbithole_thread_id_idx
  on public.posts (rabbithole_thread_id)
  where rabbithole_thread_id is not null;
