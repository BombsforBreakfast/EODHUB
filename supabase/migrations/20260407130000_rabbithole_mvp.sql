-- Rabbithole MVP: structured knowledge layer with flexible taxonomy and synonym search.

create table if not exists public.rabbithole_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.rabbithole_subtopics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.rabbithole_topics(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (topic_id, slug),
  unique (topic_id, name)
);

create table if not exists public.rabbithole_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.rabbithole_tag_aliases (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references public.rabbithole_tags(id) on delete cascade,
  alias_text text not null,
  normalized_alias text not null,
  created_at timestamptz not null default now(),
  unique (normalized_alias)
);

create table if not exists public.rabbithole_threads (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  title text not null,
  body text not null,
  author_id uuid not null references auth.users(id),
  topic_id uuid not null references public.rabbithole_topics(id),
  subtopic_id uuid references public.rabbithole_subtopics(id),
  subtopic_custom text,
  promoted_from_post_id uuid,
  is_high_value boolean not null default false,
  engagement_score numeric not null default 0,
  status text not null default 'active' check (status in ('active', 'archived', 'locked')),
  view_count integer not null default 0,
  reply_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rabbithole_threads_subtopic_choice_check check (
    not (subtopic_id is not null and subtopic_custom is not null)
  )
);

create table if not exists public.rabbithole_thread_tags (
  thread_id uuid not null references public.rabbithole_threads(id) on delete cascade,
  tag_id uuid not null references public.rabbithole_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, tag_id)
);

create table if not exists public.rabbithole_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.rabbithole_threads(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  is_answer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.rabbithole_threads
  add column if not exists pinned_answer_id uuid;

alter table public.rabbithole_threads
  drop constraint if exists rabbithole_threads_pinned_answer_id_fkey;

alter table public.rabbithole_threads
  add constraint rabbithole_threads_pinned_answer_id_fkey
  foreign key (pinned_answer_id) references public.rabbithole_replies(id) on delete set null;

create table if not exists public.rabbithole_nav_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.rabbithole_nav_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.rabbithole_nav_sessions(id) on delete cascade,
  step_index integer not null,
  step_type text not null check (step_type in ('topic', 'subtopic', 'tag', 'thread', 'search')),
  step_value text not null,
  thread_id uuid references public.rabbithole_threads(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (session_id, step_index)
);

create index if not exists rabbithole_topics_sort_idx
  on public.rabbithole_topics (is_active, sort_order, name);

create index if not exists rabbithole_subtopics_topic_sort_idx
  on public.rabbithole_subtopics (topic_id, is_active, sort_order, name);

create index if not exists rabbithole_tags_name_idx
  on public.rabbithole_tags (is_active, name);

create index if not exists rabbithole_threads_topic_activity_idx
  on public.rabbithole_threads (topic_id, last_activity_at desc);

create index if not exists rabbithole_threads_subtopic_activity_idx
  on public.rabbithole_threads (subtopic_id, last_activity_at desc);

create index if not exists rabbithole_threads_author_created_idx
  on public.rabbithole_threads (author_id, created_at desc);

create index if not exists rabbithole_threads_status_activity_idx
  on public.rabbithole_threads (status, last_activity_at desc);

create index if not exists rabbithole_threads_high_value_activity_idx
  on public.rabbithole_threads (is_high_value, last_activity_at desc);

create index if not exists rabbithole_threads_last_activity_idx
  on public.rabbithole_threads (last_activity_at desc);

create index if not exists rabbithole_thread_tags_tag_thread_idx
  on public.rabbithole_thread_tags (tag_id, thread_id);

create index if not exists rabbithole_replies_thread_created_idx
  on public.rabbithole_replies (thread_id, created_at asc);

create index if not exists rabbithole_replies_author_created_idx
  on public.rabbithole_replies (author_id, created_at desc);

create index if not exists rabbithole_nav_sessions_user_last_seen_idx
  on public.rabbithole_nav_sessions (user_id, last_seen_at desc);

create index if not exists rabbithole_nav_steps_session_index_idx
  on public.rabbithole_nav_steps (session_id, step_index);

create index if not exists rabbithole_tag_aliases_tag_idx
  on public.rabbithole_tag_aliases (tag_id);

create extension if not exists pg_trgm;

create index if not exists rabbithole_tag_aliases_alias_trgm_idx
  on public.rabbithole_tag_aliases using gin (normalized_alias gin_trgm_ops);

create index if not exists rabbithole_threads_search_trgm_title_idx
  on public.rabbithole_threads using gin (title gin_trgm_ops);

create index if not exists rabbithole_threads_search_trgm_body_idx
  on public.rabbithole_threads using gin (body gin_trgm_ops);

create or replace function public.rabbithole_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rabbithole_threads_touch_updated_at on public.rabbithole_threads;
create trigger rabbithole_threads_touch_updated_at
before update on public.rabbithole_threads
for each row execute function public.rabbithole_touch_updated_at();

drop trigger if exists rabbithole_replies_touch_updated_at on public.rabbithole_replies;
create trigger rabbithole_replies_touch_updated_at
before update on public.rabbithole_replies
for each row execute function public.rabbithole_touch_updated_at();

alter table public.rabbithole_topics enable row level security;
alter table public.rabbithole_subtopics enable row level security;
alter table public.rabbithole_tags enable row level security;
alter table public.rabbithole_tag_aliases enable row level security;
alter table public.rabbithole_threads enable row level security;
alter table public.rabbithole_thread_tags enable row level security;
alter table public.rabbithole_replies enable row level security;
alter table public.rabbithole_nav_sessions enable row level security;
alter table public.rabbithole_nav_steps enable row level security;

drop policy if exists rabbithole_topics_select_authenticated on public.rabbithole_topics;
create policy rabbithole_topics_select_authenticated
on public.rabbithole_topics
for select
to authenticated
using (true);

drop policy if exists rabbithole_subtopics_select_authenticated on public.rabbithole_subtopics;
create policy rabbithole_subtopics_select_authenticated
on public.rabbithole_subtopics
for select
to authenticated
using (true);

drop policy if exists rabbithole_tags_select_authenticated on public.rabbithole_tags;
create policy rabbithole_tags_select_authenticated
on public.rabbithole_tags
for select
to authenticated
using (true);

drop policy if exists rabbithole_tags_insert_authenticated on public.rabbithole_tags;
create policy rabbithole_tags_insert_authenticated
on public.rabbithole_tags
for insert
to authenticated
with check (created_by = auth.uid() or created_by is null);

drop policy if exists rabbithole_tag_aliases_select_authenticated on public.rabbithole_tag_aliases;
create policy rabbithole_tag_aliases_select_authenticated
on public.rabbithole_tag_aliases
for select
to authenticated
using (true);

drop policy if exists rabbithole_threads_select_authenticated on public.rabbithole_threads;
create policy rabbithole_threads_select_authenticated
on public.rabbithole_threads
for select
to authenticated
using (true);

drop policy if exists rabbithole_threads_insert_own on public.rabbithole_threads;
create policy rabbithole_threads_insert_own
on public.rabbithole_threads
for insert
to authenticated
with check (auth.uid() = author_id);

drop policy if exists rabbithole_threads_update_own on public.rabbithole_threads;
create policy rabbithole_threads_update_own
on public.rabbithole_threads
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists rabbithole_threads_delete_own on public.rabbithole_threads;
create policy rabbithole_threads_delete_own
on public.rabbithole_threads
for delete
to authenticated
using (auth.uid() = author_id);

drop policy if exists rabbithole_thread_tags_select_authenticated on public.rabbithole_thread_tags;
create policy rabbithole_thread_tags_select_authenticated
on public.rabbithole_thread_tags
for select
to authenticated
using (true);

drop policy if exists rabbithole_thread_tags_insert_authenticated on public.rabbithole_thread_tags;
create policy rabbithole_thread_tags_insert_authenticated
on public.rabbithole_thread_tags
for insert
to authenticated
with check (true);

drop policy if exists rabbithole_thread_tags_delete_authenticated on public.rabbithole_thread_tags;
create policy rabbithole_thread_tags_delete_authenticated
on public.rabbithole_thread_tags
for delete
to authenticated
using (true);

drop policy if exists rabbithole_replies_select_authenticated on public.rabbithole_replies;
create policy rabbithole_replies_select_authenticated
on public.rabbithole_replies
for select
to authenticated
using (true);

drop policy if exists rabbithole_replies_insert_own on public.rabbithole_replies;
create policy rabbithole_replies_insert_own
on public.rabbithole_replies
for insert
to authenticated
with check (auth.uid() = author_id);

drop policy if exists rabbithole_replies_update_own on public.rabbithole_replies;
create policy rabbithole_replies_update_own
on public.rabbithole_replies
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists rabbithole_replies_delete_own on public.rabbithole_replies;
create policy rabbithole_replies_delete_own
on public.rabbithole_replies
for delete
to authenticated
using (auth.uid() = author_id);

drop policy if exists rabbithole_nav_sessions_select_own on public.rabbithole_nav_sessions;
create policy rabbithole_nav_sessions_select_own
on public.rabbithole_nav_sessions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists rabbithole_nav_sessions_insert_own on public.rabbithole_nav_sessions;
create policy rabbithole_nav_sessions_insert_own
on public.rabbithole_nav_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists rabbithole_nav_sessions_update_own on public.rabbithole_nav_sessions;
create policy rabbithole_nav_sessions_update_own
on public.rabbithole_nav_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists rabbithole_nav_sessions_delete_own on public.rabbithole_nav_sessions;
create policy rabbithole_nav_sessions_delete_own
on public.rabbithole_nav_sessions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists rabbithole_nav_steps_select_own on public.rabbithole_nav_steps;
create policy rabbithole_nav_steps_select_own
on public.rabbithole_nav_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.rabbithole_nav_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists rabbithole_nav_steps_insert_own on public.rabbithole_nav_steps;
create policy rabbithole_nav_steps_insert_own
on public.rabbithole_nav_steps
for insert
to authenticated
with check (
  exists (
    select 1
    from public.rabbithole_nav_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists rabbithole_nav_steps_delete_own on public.rabbithole_nav_steps;
create policy rabbithole_nav_steps_delete_own
on public.rabbithole_nav_steps
for delete
to authenticated
using (
  exists (
    select 1
    from public.rabbithole_nav_sessions s
    where s.id = session_id
      and s.user_id = auth.uid()
  )
);
