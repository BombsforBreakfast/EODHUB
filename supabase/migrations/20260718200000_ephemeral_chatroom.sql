-- Ephemeral lobby chatroom: messages hard-expire after 24h (no archive).

begin;

create table if not exists public.chatroom_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null default 'lobby',
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  tag text null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint chatroom_messages_body_len check (char_length(body) between 1 and 500),
  constraint chatroom_messages_tag_check check (
    tag is null or tag in ('general', 'question', 'looking', 'hiring')
  )
);

create index if not exists chatroom_messages_room_created_idx
  on public.chatroom_messages (room_id, created_at desc);

create index if not exists chatroom_messages_expires_idx
  on public.chatroom_messages (expires_at);

comment on table public.chatroom_messages is
  'Ephemeral chatroom messages. Rows are hard-deleted after expires_at; not archived.';

create table if not exists public.chatroom_reactions (
  message_id uuid not null references public.chatroom_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint chatroom_reactions_value_check check (value in ('up', 'down'))
);

create index if not exists chatroom_reactions_user_idx
  on public.chatroom_reactions (user_id);

-- Snapshots so reports survive message purge (App Store / Play UGC).
create table if not exists public.chatroom_flag_snapshots (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  category text null,
  created_at timestamptz not null default now()
);

create index if not exists chatroom_flag_snapshots_message_idx
  on public.chatroom_flag_snapshots (message_id);

alter table public.chatroom_messages enable row level security;
alter table public.chatroom_reactions enable row level security;
alter table public.chatroom_flag_snapshots enable row level security;

drop policy if exists chatroom_messages_select on public.chatroom_messages;
create policy chatroom_messages_select
  on public.chatroom_messages
  for select
  to authenticated
  using (expires_at > now());

drop policy if exists chatroom_messages_insert on public.chatroom_messages;
create policy chatroom_messages_insert
  on public.chatroom_messages
  for insert
  to authenticated
  with check (user_id = auth.uid() and expires_at > now());

drop policy if exists chatroom_messages_delete_own on public.chatroom_messages;
create policy chatroom_messages_delete_own
  on public.chatroom_messages
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists chatroom_reactions_select on public.chatroom_reactions;
create policy chatroom_reactions_select
  on public.chatroom_reactions
  for select
  to authenticated
  using (true);

drop policy if exists chatroom_reactions_insert on public.chatroom_reactions;
create policy chatroom_reactions_insert
  on public.chatroom_reactions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists chatroom_reactions_update on public.chatroom_reactions;
create policy chatroom_reactions_update
  on public.chatroom_reactions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists chatroom_reactions_delete on public.chatroom_reactions;
create policy chatroom_reactions_delete
  on public.chatroom_reactions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Snapshots: reporters can insert; no public select (service role / admin only).
drop policy if exists chatroom_flag_snapshots_insert on public.chatroom_flag_snapshots;
create policy chatroom_flag_snapshots_insert
  on public.chatroom_flag_snapshots
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chatroom_messages'
  ) then
    alter publication supabase_realtime add table public.chatroom_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chatroom_reactions'
  ) then
    alter publication supabase_realtime add table public.chatroom_reactions;
  end if;
end$$;

-- Allow reporting chatroom messages in flags.content_type
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
    'comment',
    'message',
    'rabbithole_contribution',
    'rabbithole_contribution_comment',
    'rabbithole_thread',
    'rabbithole_reply',
    'chatroom_message'
  )
);

commit;
