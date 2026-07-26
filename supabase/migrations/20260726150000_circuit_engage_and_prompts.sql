-- Collapsing Circuit: more prompts + expand-only reactions/comments.

begin;

insert into public.circuit_prompts (slug, label, sort_hint)
values
  ('kit-setup', 'kit setup', 80),
  ('demo-day', 'demo day', 90),
  ('whats-your-hobby', 'what''s your hobby', 100)
on conflict (slug) do update
set
  label = excluded.label,
  sort_hint = excluded.sort_hint,
  is_active = true;

create table if not exists public.circuit_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.circuit_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint circuit_comments_body_len check (char_length(body) between 1 and 280)
);

create index if not exists circuit_comments_post_created_idx
  on public.circuit_comments (post_id, created_at asc);

create index if not exists circuit_comments_user_idx
  on public.circuit_comments (user_id);

alter table public.circuit_comments enable row level security;

drop policy if exists circuit_comments_select on public.circuit_comments;
create policy circuit_comments_select
  on public.circuit_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.circuit_posts p
      where p.id = circuit_comments.post_id
        and p.expires_at > now()
    )
  );

drop policy if exists circuit_comments_insert on public.circuit_comments;
create policy circuit_comments_insert
  on public.circuit_comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.circuit_posts p
      where p.id = circuit_comments.post_id
        and p.expires_at > now()
    )
  );

drop policy if exists circuit_comments_delete_own on public.circuit_comments;
create policy circuit_comments_delete_own
  on public.circuit_comments
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Allow circuit_post as a reaction subject.
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.content_reactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%subject_kind%'
  loop
    execute format('alter table public.content_reactions drop constraint %I', cname);
  end loop;
end$$;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in (
    'post',
    'post_comment',
    'unit_post',
    'unit_post_comment',
    'event',
    'event_comment',
    'memorial',
    'memorial_comment',
    'circuit_post'
  )
);

commit;
