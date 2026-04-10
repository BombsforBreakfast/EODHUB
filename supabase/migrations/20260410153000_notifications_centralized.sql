begin;

alter table public.notifications
  add column if not exists recipient_user_id uuid references auth.users (id) on delete cascade,
  add column if not exists actor_user_id uuid references auth.users (id) on delete set null,
  add column if not exists category text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists parent_entity_type text,
  add column if not exists parent_entity_id uuid,
  add column if not exists link text,
  add column if not exists group_key text,
  add column if not exists dedupe_key text,
  add column if not exists read_at timestamptz,
  add column if not exists archived_at timestamptz;

update public.notifications
set recipient_user_id = coalesce(recipient_user_id, user_id),
    actor_user_id = coalesce(actor_user_id, actor_id),
    read_at = case when is_read = true and read_at is null then created_at else read_at end,
    category = coalesce(
      category,
      case
        when type like 'unit_%' then 'group'
        when type like 'mention_%' then 'social'
        when type like 'feed_%' then 'social'
        when type = 'message_request' then 'message'
        when type like 'connection_%' then 'social'
        when type = 'job_save' then 'jobs'
        else 'system'
      end
    ),
    entity_type = coalesce(
      entity_type,
      case
        when type = 'message_request' then 'thread'
        when unit_post_id is not null then 'unit_post'
        when post_id is not null then 'post'
        when unit_id is not null then 'unit'
        else null
      end
    ),
    entity_id = coalesce(entity_id, unit_post_id, post_id, unit_id),
    group_key = coalesce(
      group_key,
      case
        when type = 'message_request' and metadata ? 'conversation_id'
          then 'thread:' || (metadata->>'conversation_id') || ':messages'
        when type like 'unit_post_%' and unit_post_id is not null
          then 'unit_post:' || unit_post_id::text || ':' || coalesce(type, 'activity')
        when type like 'feed_%' and post_id is not null
          then 'post:' || post_id::text || ':' || coalesce(type, 'activity')
        when type like 'mention_%' and post_id is not null
          then 'post:' || post_id::text || ':mentions'
        else 'notification:' || id::text
      end
    ),
    link = coalesce(
      link,
      case
        when type in ('unit_join_request') and metadata ? 'unit_slug'
          then '/units/' || (metadata->>'unit_slug') || '/admin'
        when type in ('unit_join_approval', 'unit_invite') and metadata ? 'unit_slug'
          then '/units/' || (metadata->>'unit_slug')
        when type in ('unit_post_like', 'unit_post_comment', 'unit_hot') and metadata ? 'unit_slug' and unit_post_id is not null
          then '/units/' || (metadata->>'unit_slug') || '?unitPostId=' || unit_post_id::text
        when post_id is not null
          then '/?postId=' || post_id::text
        else null
      end
    );

update public.notifications
set recipient_user_id = user_id
where recipient_user_id is null and user_id is not null;

alter table public.notifications
  alter column recipient_user_id set not null;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists idx_notifications_recipient_active
  on public.notifications (recipient_user_id, archived_at, read_at, created_at desc);

create index if not exists idx_notifications_unread_partial
  on public.notifications (recipient_user_id, created_at desc)
  where archived_at is null and read_at is null;

create unique index if not exists idx_notifications_recipient_dedupe_active
  on public.notifications (recipient_user_id, dedupe_key)
  where dedupe_key is not null and archived_at is null;

create or replace function public.notifications_sync_legacy_columns()
returns trigger
language plpgsql
as $$
begin
  if new.recipient_user_id is null then
    new.recipient_user_id := new.user_id;
  end if;
  if new.user_id is null then
    new.user_id := new.recipient_user_id;
  end if;

  if new.actor_user_id is null then
    new.actor_user_id := new.actor_id;
  end if;
  if new.actor_id is null then
    new.actor_id := new.actor_user_id;
  end if;

  if new.read_at is null and new.is_read = true then
    new.read_at := coalesce(new.created_at, now());
  end if;
  if new.is_read is null then
    new.is_read := (new.read_at is not null);
  end if;
  if new.is_read = false and new.read_at is not null then
    new.is_read := true;
  end if;

  if new.group_key is null then
    if new.type = 'message_request' and new.metadata ? 'conversation_id' then
      new.group_key := 'thread:' || (new.metadata->>'conversation_id') || ':messages';
    elsif new.unit_post_id is not null then
      new.group_key := 'unit_post:' || new.unit_post_id::text || ':' || coalesce(new.type, 'activity');
    elsif new.post_id is not null then
      new.group_key := 'post:' || new.post_id::text || ':' || coalesce(new.type, 'activity');
    else
      new.group_key := 'notification:' || coalesce(new.id::text, gen_random_uuid()::text);
    end if;
  end if;

  if new.category is null then
    new.category :=
      case
        when new.type like 'unit_%' then 'group'
        when new.type = 'message_request' then 'message'
        when new.type like 'mention_%' or new.type like 'feed_%' then 'social'
        else 'system'
      end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notifications_sync_legacy on public.notifications;
create trigger trg_notifications_sync_legacy
before insert or update on public.notifications
for each row execute procedure public.notifications_sync_legacy_columns();

create or replace function public.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_post_owner_id uuid default null,
  p_type text default null,
  p_category text default 'system',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_parent_entity_type text default null,
  p_parent_entity_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_message text default null,
  p_link text default null,
  p_group_key text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notifications%rowtype;
  v_message text;
  v_group_key text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required';
  end if;

  if p_actor_user_id is not null and p_actor_user_id = p_recipient_user_id then
    select * into v_row from public.notifications where false;
    return v_row;
  end if;

  if p_dedupe_key is not null then
    select *
    into v_row
    from public.notifications n
    where n.recipient_user_id = p_recipient_user_id
      and n.dedupe_key = p_dedupe_key
      and n.archived_at is null
    order by n.created_at desc
    limit 1;

    if found then
      return v_row;
    end if;
  end if;

  v_message := coalesce(nullif(p_message, ''), concat_ws(' - ', nullif(p_title, ''), nullif(p_body, '')), coalesce(p_type, 'Notification'));
  v_group_key := coalesce(nullif(p_group_key, ''), 'notification:' || coalesce(p_entity_id::text, gen_random_uuid()::text));

  insert into public.notifications (
    recipient_user_id,
    user_id,
    actor_user_id,
    actor_id,
    type,
    category,
    entity_type,
    entity_id,
    parent_entity_type,
    parent_entity_id,
    actor_name,
    post_owner_id,
    message,
    link,
    group_key,
    dedupe_key,
    metadata,
    is_read,
    read_at,
    archived_at
  )
  values (
    p_recipient_user_id,
    p_recipient_user_id,
    p_actor_user_id,
    p_actor_user_id,
    coalesce(p_type, 'generic'),
    coalesce(p_category, 'system'),
    p_entity_type,
    p_entity_id,
    p_parent_entity_type,
    p_parent_entity_id,
    p_actor_name,
    p_post_owner_id,
    v_message,
    p_link,
    v_group_key,
    p_dedupe_key,
    coalesce(p_metadata, '{}'::jsonb),
    false,
    null,
    null
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_notification(
  uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, text, text, text, text, text, jsonb
) from public;
grant execute on function public.create_notification(
  uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, text, text, text, text, text, jsonb
) to authenticated, service_role;

alter table public.notifications enable row level security;

drop policy if exists "Notifications select own recipient" on public.notifications;
create policy "Notifications select own recipient"
  on public.notifications
  for select
  using (recipient_user_id = auth.uid() or user_id = auth.uid());

drop policy if exists "Notifications update own recipient" on public.notifications;
create policy "Notifications update own recipient"
  on public.notifications
  for update
  using (recipient_user_id = auth.uid() or user_id = auth.uid())
  with check (recipient_user_id = auth.uid() or user_id = auth.uid());

drop policy if exists "Users delete own notifications" on public.notifications;

drop policy if exists "Notifications insert own recipient" on public.notifications;
create policy "Notifications insert own recipient"
  on public.notifications
  for insert
  with check (recipient_user_id = auth.uid() and recipient_user_id = user_id);

commit;
