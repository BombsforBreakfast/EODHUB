begin;

-- Discussion threads on public calendar events (/events upcoming list).
create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_comments_content_nonempty check (char_length(trim(content)) > 0)
);

create index event_comments_event_id_idx on public.event_comments (event_id);
create index event_comments_user_id_idx on public.event_comments (user_id);

create or replace function public.event_comments_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists event_comments_touch_updated_at on public.event_comments;
create trigger event_comments_touch_updated_at
  before update on public.event_comments
  for each row execute function public.event_comments_touch_updated_at();

alter table public.event_comments enable row level security;

drop policy if exists event_comments_select_public_calendar on public.event_comments;
create policy event_comments_select_public_calendar
  on public.event_comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_comments.event_id
        and e.unit_id is null
        and coalesce(e.visibility, 'public') = 'public'
    )
  );

drop policy if exists event_comments_insert_visible_events on public.event_comments;
create policy event_comments_insert_visible_events
  on public.event_comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.events e
      where e.id = event_comments.event_id
        and e.unit_id is null
        and coalesce(e.visibility, 'public') = 'public'
    )
  );

drop policy if exists event_comments_update_own on public.event_comments;
create policy event_comments_update_own
  on public.event_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists event_comments_delete_own on public.event_comments;
create policy event_comments_delete_own
  on public.event_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

alter table public.content_reactions drop constraint content_reactions_subject_kind_check;

alter table public.content_reactions add constraint content_reactions_subject_kind_check check (
  subject_kind in ('post', 'post_comment', 'unit_post_comment', 'event', 'event_comment')
);

comment on table public.event_comments is
  'Comments on public calendar events; content_reactions.subject_kind event_comment -> event_comments.id.';

comment on table public.content_reactions is
  'Fast reactions; subject_kind scopes subject_id (post, post_comment, unit_post_comment, event, event_comment, ...).';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_comments'
  ) then
    alter publication supabase_realtime add table public.event_comments;
  end if;
end $$;

commit;
