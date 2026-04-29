-- Resource likes/comments with optional star rating on comments.

create table if not exists public.resource_likes (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.business_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint resource_likes_unique_user_resource unique (resource_id, user_id)
);

create table if not exists public.resource_comments (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.business_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  rating numeric(2, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_comments_content_len check (
    char_length(trim(content)) >= 1 and char_length(content) <= 1200
  ),
  constraint resource_comments_rating_range check (
    rating is null or (rating >= 1.0 and rating <= 5.0)
  )
);

create index if not exists resource_likes_resource_id_idx
  on public.resource_likes (resource_id, created_at desc);

create index if not exists resource_comments_resource_id_idx
  on public.resource_comments (resource_id, created_at asc);

create or replace function public.resource_comments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists resource_comments_touch_updated_at on public.resource_comments;
create trigger resource_comments_touch_updated_at
before update on public.resource_comments
for each row execute function public.resource_comments_touch_updated_at();

alter table public.resource_likes enable row level security;
alter table public.resource_comments enable row level security;

drop policy if exists resource_likes_select_authenticated on public.resource_likes;
create policy resource_likes_select_authenticated
on public.resource_likes
for select
to authenticated
using (true);

drop policy if exists resource_likes_insert_own on public.resource_likes;
create policy resource_likes_insert_own
on public.resource_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists resource_likes_delete_own on public.resource_likes;
create policy resource_likes_delete_own
on public.resource_likes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists resource_comments_select_authenticated on public.resource_comments;
create policy resource_comments_select_authenticated
on public.resource_comments
for select
to authenticated
using (true);

drop policy if exists resource_comments_insert_own on public.resource_comments;
create policy resource_comments_insert_own
on public.resource_comments
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists resource_comments_update_own on public.resource_comments;
create policy resource_comments_update_own
on public.resource_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists resource_comments_delete_own on public.resource_comments;
create policy resource_comments_delete_own
on public.resource_comments
for delete
to authenticated
using (user_id = auth.uid());
