-- Allow memorial scrapbook contributors to edit/delete their own items;
-- admins retain full access. Mutations stay in security definer RPCs.

-- ---------------------------------------------------------------------------
-- Delete: admin OR row author (user_id = auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.delete_memorial_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Forbidden';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.user_id = v_uid;

  select i.user_id
  into v_owner
  from public.memorial_scrapbook_items i
  where i.id = p_item_id;

  if not FOUND then
    raise exception 'Item not found';
  end if;

  if not coalesce(v_is_admin, false) and (v_owner is distinct from v_uid) then
    raise exception 'Forbidden';
  end if;

  delete from public.memorial_scrapbook_items where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Update: admin (any status) OR author on own pending/approved row.
-- p_updates jsonb may include keys: caption, memory_body, external_url,
-- thumbnail_url, location, event_date (yyyy-mm-dd or empty string for null), file_url.
-- ---------------------------------------------------------------------------
create or replace function public.update_memorial_scrapbook_item(
  p_item_id uuid,
  p_updates jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  r public.memorial_scrapbook_items%rowtype;
  v_caption text;
  v_memory text;
  v_external text;
  v_thumb text;
  v_location text;
  v_event date;
  v_file text;
begin
  if v_uid is null then
    raise exception 'Forbidden';
  end if;

  select coalesce(p.is_admin, false)
  into v_is_admin
  from public.profiles p
  where p.user_id = v_uid;

  select * into strict r
  from public.memorial_scrapbook_items
  where id = p_item_id;

  if not coalesce(v_is_admin, false) and (r.user_id is distinct from v_uid) then
    raise exception 'Forbidden';
  end if;

  if not coalesce(v_is_admin, false) and r.status not in ('pending', 'approved') then
    raise exception 'Cannot edit this item';
  end if;

  v_caption := r.caption;
  v_memory := r.memory_body;
  v_external := r.external_url;
  v_thumb := r.thumbnail_url;
  v_location := r.location;
  v_event := r.event_date;
  v_file := r.file_url;

  if p_updates ? 'caption' then
    v_caption := nullif(trim(p_updates->>'caption'), '');
  end if;
  if p_updates ? 'memory_body' then
    v_memory := nullif(trim(p_updates->>'memory_body'), '');
  end if;
  if p_updates ? 'external_url' then
    v_external := nullif(trim(p_updates->>'external_url'), '');
  end if;
  if p_updates ? 'thumbnail_url' then
    v_thumb := nullif(trim(p_updates->>'thumbnail_url'), '');
  end if;
  if p_updates ? 'location' then
    v_location := nullif(trim(p_updates->>'location'), '');
  end if;
  if p_updates ? 'event_date' then
    if nullif(trim(p_updates->>'event_date'), '') is null then
      v_event := null;
    else
      v_event := (p_updates->>'event_date')::date;
    end if;
  end if;
  if p_updates ? 'file_url' then
    v_file := nullif(trim(p_updates->>'file_url'), '');
  end if;

  if r.item_type = 'memory' then
    if coalesce(trim(v_memory), '') = '' and coalesce(trim(v_caption), '') = '' then
      raise exception 'Memory items require memory text or caption';
    end if;
  elsif r.item_type = 'article' then
    if coalesce(trim(v_external), '') = '' then
      raise exception 'Article items require a URL';
    end if;
  elsif r.item_type = 'photo' then
    if coalesce(trim(v_file), '') = '' then
      raise exception 'Photo items require a file URL';
    end if;
  elsif r.item_type = 'document' then
    if coalesce(trim(v_file), '') = '' then
      raise exception 'Document items require a file URL';
    end if;
  end if;

  update public.memorial_scrapbook_items
  set
    caption = v_caption,
    memory_body = v_memory,
    external_url = v_external,
    thumbnail_url = v_thumb,
    location = v_location,
    event_date = v_event,
    file_url = v_file
  where id = p_item_id;
end;
$$;

grant execute on function public.update_memorial_scrapbook_item(uuid, jsonb) to authenticated;
