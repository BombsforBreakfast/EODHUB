-- RabbitHole contributions lane
-- Parallel to existing promoted feed/group thread flow.
-- Keeps current RabbitHole post-promotion experience intact.

create table if not exists public.rabbithole_contributions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  content_type text not null check (content_type in ('document', 'video', 'article_news', 'external_link', 'resource')),
  category_id uuid not null references public.rabbithole_topics(id) on delete restrict,
  source_url text,
  source_domain text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived', 'flagged')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  constraint rabbithole_contributions_summary_len check (char_length(trim(summary)) >= 20)
);

create table if not exists public.rabbithole_contribution_tags (
  contribution_id uuid not null references public.rabbithole_contributions(id) on delete cascade,
  tag_id uuid not null references public.rabbithole_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contribution_id, tag_id)
);

create table if not exists public.rabbithole_contribution_likes (
  contribution_id uuid not null references public.rabbithole_contributions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contribution_id, user_id)
);

create table if not exists public.rabbithole_contribution_comments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.rabbithole_contributions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint rabbithole_contribution_comments_body_len check (
    char_length(trim(body)) >= 1 and char_length(body) <= 1200
  )
);

create index if not exists rabbithole_contributions_status_activity_idx
  on public.rabbithole_contributions (status, last_activity_at desc);

create index if not exists rabbithole_contributions_category_activity_idx
  on public.rabbithole_contributions (category_id, last_activity_at desc);

create index if not exists rabbithole_contributions_content_type_idx
  on public.rabbithole_contributions (content_type);

create index if not exists rabbithole_contributions_source_domain_idx
  on public.rabbithole_contributions (source_domain);

create index if not exists rabbithole_contribution_tags_tag_idx
  on public.rabbithole_contribution_tags (tag_id, contribution_id);

create index if not exists rabbithole_contribution_comments_contribution_idx
  on public.rabbithole_contribution_comments (contribution_id, created_at asc);

create extension if not exists pg_trgm;

create index if not exists rabbithole_contributions_title_trgm_idx
  on public.rabbithole_contributions using gin (title gin_trgm_ops);

create index if not exists rabbithole_contributions_summary_trgm_idx
  on public.rabbithole_contributions using gin (summary gin_trgm_ops);

create or replace function public.rabbithole_contributions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rabbithole_contributions_touch_updated_at on public.rabbithole_contributions;
create trigger rabbithole_contributions_touch_updated_at
before update on public.rabbithole_contributions
for each row execute function public.rabbithole_contributions_touch_updated_at();

drop trigger if exists rabbithole_contribution_comments_touch_updated_at on public.rabbithole_contribution_comments;
create trigger rabbithole_contribution_comments_touch_updated_at
before update on public.rabbithole_contribution_comments
for each row execute function public.rabbithole_contributions_touch_updated_at();

alter table public.rabbithole_contributions enable row level security;
alter table public.rabbithole_contribution_tags enable row level security;
alter table public.rabbithole_contribution_likes enable row level security;
alter table public.rabbithole_contribution_comments enable row level security;

drop policy if exists rabbithole_contributions_select_authenticated on public.rabbithole_contributions;
create policy rabbithole_contributions_select_authenticated
on public.rabbithole_contributions
for select
to authenticated
using (status = 'active' or created_by = auth.uid());

drop policy if exists rabbithole_contributions_insert_own on public.rabbithole_contributions;
create policy rabbithole_contributions_insert_own
on public.rabbithole_contributions
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists rabbithole_contributions_update_own on public.rabbithole_contributions;
create policy rabbithole_contributions_update_own
on public.rabbithole_contributions
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

drop policy if exists rabbithole_contribution_tags_select_authenticated on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_select_authenticated
on public.rabbithole_contribution_tags
for select
to authenticated
using (true);

drop policy if exists rabbithole_contribution_tags_insert_authenticated on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_insert_authenticated
on public.rabbithole_contribution_tags
for insert
to authenticated
with check (true);

drop policy if exists rabbithole_contribution_tags_delete_authenticated on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_delete_authenticated
on public.rabbithole_contribution_tags
for delete
to authenticated
using (true);

drop policy if exists rabbithole_contribution_likes_select_authenticated on public.rabbithole_contribution_likes;
create policy rabbithole_contribution_likes_select_authenticated
on public.rabbithole_contribution_likes
for select
to authenticated
using (true);

drop policy if exists rabbithole_contribution_likes_insert_own on public.rabbithole_contribution_likes;
create policy rabbithole_contribution_likes_insert_own
on public.rabbithole_contribution_likes
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists rabbithole_contribution_likes_delete_own on public.rabbithole_contribution_likes;
create policy rabbithole_contribution_likes_delete_own
on public.rabbithole_contribution_likes
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists rabbithole_contribution_comments_select_authenticated on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_select_authenticated
on public.rabbithole_contribution_comments
for select
to authenticated
using (deleted_at is null);

drop policy if exists rabbithole_contribution_comments_insert_own on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_insert_own
on public.rabbithole_contribution_comments
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists rabbithole_contribution_comments_update_own on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_update_own
on public.rabbithole_contribution_comments
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists rabbithole_contribution_comments_delete_own on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_delete_own
on public.rabbithole_contribution_comments
for delete
to authenticated
using (user_id = auth.uid());
