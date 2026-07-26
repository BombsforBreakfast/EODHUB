-- Collapsing Circuit: ephemeral stories-style tiles (24h TTL).

begin;

create table if not exists public.circuit_prompts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  sort_hint int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint circuit_prompts_label_len check (char_length(label) between 1 and 80),
  constraint circuit_prompts_slug_len check (char_length(slug) between 1 and 64)
);

create index if not exists circuit_prompts_active_sort_idx
  on public.circuit_prompts (is_active, sort_hint, created_at);

comment on table public.circuit_prompts is
  'Persistent prompt bank for Collapsing Circuit. Using a prompt never removes it.';

create table if not exists public.circuit_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  prompt_id uuid null references public.circuit_prompts (id) on delete set null,
  post_type text not null,
  body text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint circuit_posts_type_check check (post_type in ('media', 'thought')),
  constraint circuit_posts_body_len check (
    body is null or char_length(body) between 1 and 280
  ),
  constraint circuit_posts_thought_body_check check (
    (post_type = 'thought' and body is not null and char_length(body) >= 1)
    or (post_type = 'media')
  )
);

create index if not exists circuit_posts_expires_idx
  on public.circuit_posts (expires_at);

create index if not exists circuit_posts_created_idx
  on public.circuit_posts (created_at desc);

comment on table public.circuit_posts is
  'Ephemeral Collapsing Circuit posts. Hard-deleted after expires_at; not archived.';

create table if not exists public.circuit_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.circuit_posts (id) on delete cascade,
  sort_order int not null default 0,
  media_type text not null,
  public_url text not null,
  storage_path text null,
  poster_url text null,
  created_at timestamptz not null default now(),
  constraint circuit_post_media_type_check check (media_type in ('image', 'video')),
  constraint circuit_post_media_url_len check (char_length(public_url) between 1 and 2000),
  constraint circuit_post_media_sort_nonneg check (sort_order >= 0)
);

create index if not exists circuit_post_media_post_sort_idx
  on public.circuit_post_media (post_id, sort_order);

create table if not exists public.circuit_flag_snapshots (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  post_type text not null,
  body text null,
  media_urls text[] null,
  category text null,
  created_at timestamptz not null default now()
);

create index if not exists circuit_flag_snapshots_post_idx
  on public.circuit_flag_snapshots (post_id);

alter table public.circuit_prompts enable row level security;
alter table public.circuit_posts enable row level security;
alter table public.circuit_post_media enable row level security;
alter table public.circuit_flag_snapshots enable row level security;

drop policy if exists circuit_prompts_select on public.circuit_prompts;
create policy circuit_prompts_select
  on public.circuit_prompts
  for select
  to authenticated
  using (is_active = true);

drop policy if exists circuit_posts_select on public.circuit_posts;
create policy circuit_posts_select
  on public.circuit_posts
  for select
  to authenticated
  using (expires_at > now());

drop policy if exists circuit_posts_insert on public.circuit_posts;
create policy circuit_posts_insert
  on public.circuit_posts
  for insert
  to authenticated
  with check (user_id = auth.uid() and expires_at > now());

drop policy if exists circuit_posts_delete_own on public.circuit_posts;
create policy circuit_posts_delete_own
  on public.circuit_posts
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists circuit_post_media_select on public.circuit_post_media;
create policy circuit_post_media_select
  on public.circuit_post_media
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circuit_posts p
      where p.id = circuit_post_media.post_id
        and p.expires_at > now()
    )
  );

drop policy if exists circuit_post_media_insert on public.circuit_post_media;
create policy circuit_post_media_insert
  on public.circuit_post_media
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.circuit_posts p
      where p.id = circuit_post_media.post_id
        and p.user_id = auth.uid()
        and p.expires_at > now()
    )
  );

drop policy if exists circuit_flag_snapshots_insert on public.circuit_flag_snapshots;
create policy circuit_flag_snapshots_insert
  on public.circuit_flag_snapshots
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- Seed prompt bank (idempotent).
insert into public.circuit_prompts (slug, label, sort_hint)
values
  ('in-the-team-room', 'in the team room', 10),
  ('deployment-photos', 'deployment photos', 20),
  ('day-at-the-lake', 'day at the lake', 30),
  ('five-oclock-somewhere', 'it''s 5 o''clock somewhere', 40),
  ('cheers', 'cheers', 50),
  ('remote-pull', 'remote pull', 60),
  ('random-thought', 'random thought', 70)
on conflict (slug) do update
set
  label = excluded.label,
  sort_hint = excluded.sort_hint,
  is_active = true;

-- Allow reporting circuit posts in flags.content_type
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.flags'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%content_type%'
  loop
    execute format('alter table public.flags drop constraint %I', cname);
  end loop;
end$$;

alter table public.flags add constraint flags_content_type_check check (
  content_type in (
    'post',
    'unit_post',
    'unit_post_comment',
    'comment',
    'message',
    'rabbithole_contribution',
    'rabbithole_contribution_comment',
    'rabbithole_thread',
    'rabbithole_reply',
    'chatroom_message',
    'circuit_post'
  )
);

commit;
