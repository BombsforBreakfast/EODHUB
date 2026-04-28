create or replace function public.notifications_sync_legacy_columns()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
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
  else
    if old.recipient_user_id is not null
      and new.recipient_user_id is null
      and new.user_id is not distinct from old.user_id then
      new.user_id := null;
    elsif new.recipient_user_id is distinct from old.recipient_user_id
      and new.recipient_user_id is not null
      and new.user_id is not distinct from old.user_id then
      new.user_id := new.recipient_user_id;
    end if;

    if old.user_id is not null
      and new.user_id is null
      and new.recipient_user_id is not distinct from old.recipient_user_id then
      new.recipient_user_id := null;
    elsif new.user_id is distinct from old.user_id
      and new.user_id is not null
      and new.recipient_user_id is not distinct from old.recipient_user_id then
      new.recipient_user_id := new.user_id;
    end if;

    if old.actor_user_id is not null
      and new.actor_user_id is null
      and new.actor_id is not distinct from old.actor_id then
      new.actor_id := null;
    elsif new.actor_user_id is distinct from old.actor_user_id
      and new.actor_user_id is not null
      and new.actor_id is not distinct from old.actor_id then
      new.actor_id := new.actor_user_id;
    end if;

    if old.actor_id is not null
      and new.actor_id is null
      and new.actor_user_id is not distinct from old.actor_user_id then
      new.actor_user_id := null;
    elsif new.actor_id is distinct from old.actor_id
      and new.actor_id is not null
      and new.actor_user_id is not distinct from old.actor_user_id then
      new.actor_user_id := new.actor_id;
    end if;
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
