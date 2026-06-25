begin;

-- Feed tribute comments on memorial anniversary cards.
create table if not exists public.memorial_comments (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint memorial_comments_content_nonempty check (char_length(trim(content)) > 0)
);

create index if not exists memorial_comments_memorial_id_idx
  on public.memorial_comments (memorial_id);

create index if not exists memorial_comments_user_id_idx
  on public.memorial_comments (user_id);

-- Legacy simple likes (backfilled into content_reactions below).
create table if not exists public.memorial_likes (
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memorial_id, user_id)
);

alter table public.memorial_comments enable row level security;
alter table public.memorial_likes enable row level security;

drop policy if exists memorial_comments_select_authenticated on public.memorial_comments;
create policy memorial_comments_select_authenticated
  on public.memorial_comments for select to authenticated using (true);

drop policy if exists memorial_comments_insert_own on public.memorial_comments;
create policy memorial_comments_insert_own
  on public.memorial_comments for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists memorial_comments_update_own on public.memorial_comments;
create policy memorial_comments_update_own
  on public.memorial_comments for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists memorial_comments_delete_own on public.memorial_comments;
create policy memorial_comments_delete_own
  on public.memorial_comments for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists memorial_likes_select_authenticated on public.memorial_likes;
create policy memorial_likes_select_authenticated
  on public.memorial_likes for select to authenticated using (true);

drop policy if exists memorial_likes_insert_own on public.memorial_likes;
create policy memorial_likes_insert_own
  on public.memorial_likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists memorial_likes_delete_own on public.memorial_likes;
create policy memorial_likes_delete_own
  on public.memorial_likes for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.content_reactions drop constraint if exists content_reactions_subject_kind_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in (
    'post',
    'post_comment',
    'unit_post',
    'unit_post_comment',
    'event',
    'event_comment',
    'memorial',
    'memorial_comment'
  )
);

insert into public.content_reactions (subject_kind, subject_id, user_id, reaction_type, created_at, updated_at)
select
  'memorial'::text,
  ml.memorial_id,
  ml.user_id,
  'like'::text,
  coalesce(ml.created_at, now()),
  coalesce(ml.created_at, now())
from public.memorial_likes ml
on conflict (subject_kind, subject_id, user_id) do nothing;

comment on table public.memorial_comments is
  'Tribute comments on memorial feed cards; content_reactions.subject_kind memorial_comment -> memorial_comments.id.';

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post, event, memorial, memorial_comment, ...).';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'memorial_comments'
  ) then
    alter publication supabase_realtime add table public.memorial_comments;
  end if;
end $$;

commit;
