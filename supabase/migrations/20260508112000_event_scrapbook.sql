begin;

create table if not exists public.event_scrapbook_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  item_type text not null check (item_type in ('photo', 'article', 'document', 'memory')),
  file_url text,
  external_url text,
  thumbnail_url text,
  memory_body text,
  caption text,
  location text,
  event_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'flagged')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);

create index if not exists event_scrapbook_items_event_approved_created_idx
  on public.event_scrapbook_items (event_id, created_at desc)
  where status = 'approved';
create index if not exists event_scrapbook_items_admin_queue_idx
  on public.event_scrapbook_items (status, created_at desc)
  where status in ('pending', 'flagged');

create table if not exists public.event_scrapbook_flags (
  id uuid primary key default gen_random_uuid(),
  scrapbook_item_id uuid not null references public.event_scrapbook_items (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text not null check (reason in ('in_photo', 'inappropriate', 'incorrect', 'duplicate', 'other')),
  details text,
  created_at timestamptz not null default now(),
  unique (scrapbook_item_id, user_id)
);

create or replace function public.trg_event_scrapbook_items_validate_ins()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from 'pending' then
    raise exception 'Scrapbook items must be submitted as pending';
  end if;
  if not exists (select 1 from public.events e where e.id = new.event_id) then
    raise exception 'Event not found';
  end if;
  if new.item_type in ('photo', 'document') then
    if new.file_url is null or trim(new.file_url) = '' then
      raise exception 'File upload required for this item type';
    end if;
  elsif new.item_type = 'article' then
    if new.external_url is null or trim(new.external_url) = '' then
      raise exception 'Article items require an external URL';
    end if;
  elsif new.item_type = 'memory' then
    if coalesce(trim(new.memory_body), '') = '' and coalesce(trim(new.caption), '') = '' then
      raise exception 'Memory items require text in memory or caption';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_scrapbook_items_validate_ins on public.event_scrapbook_items;
create trigger trg_event_scrapbook_items_validate_ins
  before insert on public.event_scrapbook_items
  for each row execute function public.trg_event_scrapbook_items_validate_ins();

create or replace function public.trg_event_scrapbook_flags_after_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(distinct f.user_id) into n
  from public.event_scrapbook_flags f
  where f.scrapbook_item_id = new.scrapbook_item_id
    and f.user_id is not null;
  if n >= 2 then
    update public.event_scrapbook_items i
    set status = 'flagged'
    where i.id = new.scrapbook_item_id
      and i.status = 'approved';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_scrapbook_flags_after_ins on public.event_scrapbook_flags;
create trigger trg_event_scrapbook_flags_after_ins
  after insert on public.event_scrapbook_flags
  for each row execute function public.trg_event_scrapbook_flags_after_ins();

alter table public.event_scrapbook_items enable row level security;
alter table public.event_scrapbook_flags enable row level security;

drop policy if exists event_scrapbook_items_select_public on public.event_scrapbook_items;
create policy event_scrapbook_items_select_public
  on public.event_scrapbook_items
  for select
  using (status = 'approved');

drop policy if exists event_scrapbook_items_select_admin on public.event_scrapbook_items;
create policy event_scrapbook_items_select_admin
  on public.event_scrapbook_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists event_scrapbook_items_insert_own on public.event_scrapbook_items;
create policy event_scrapbook_items_insert_own
  on public.event_scrapbook_items
  for insert
  to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists event_scrapbook_flags_select_admin on public.event_scrapbook_flags;
create policy event_scrapbook_flags_select_admin
  on public.event_scrapbook_flags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists event_scrapbook_flags_insert_own on public.event_scrapbook_flags;
create policy event_scrapbook_flags_insert_own
  on public.event_scrapbook_flags
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.event_scrapbook_items i
      where i.id = scrapbook_item_id and i.status = 'approved'
    )
  );

create or replace function public.approve_event_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;
  update public.event_scrapbook_items
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_item_id and status in ('pending', 'flagged');
  if not found then
    raise exception 'Item not found or not reviewable';
  end if;
end;
$$;

create or replace function public.reject_event_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;
  update public.event_scrapbook_items
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_item_id and status in ('pending', 'flagged');
  if not found then
    raise exception 'Item not found or not reviewable';
  end if;
end;
$$;

create or replace function public.restore_event_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;
  update public.event_scrapbook_items
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_item_id and status = 'rejected';
  if not found then
    raise exception 'Item not found or not rejected';
  end if;
end;
$$;

create or replace function public.delete_event_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.event_scrapbook_items i
    where i.id = p_item_id
      and (
        i.user_id = auth.uid()
        or exists (
          select 1 from public.profiles p
          where p.user_id = auth.uid() and coalesce(p.is_admin, false)
        )
      )
  ) then
    raise exception 'Forbidden';
  end if;
  delete from public.event_scrapbook_items where id = p_item_id;
end;
$$;

create or replace function public.update_event_scrapbook_item(p_item_id uuid, p_updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.event_scrapbook_items%rowtype;
begin
  select * into v_item from public.event_scrapbook_items where id = p_item_id;
  if not found then
    raise exception 'Item not found';
  end if;
  if not (
    v_item.user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  ) then
    raise exception 'Forbidden';
  end if;

  update public.event_scrapbook_items
  set
    caption = coalesce(p_updates->>'caption', caption),
    memory_body = coalesce(p_updates->>'memory_body', memory_body),
    external_url = coalesce(p_updates->>'external_url', external_url),
    thumbnail_url = coalesce(p_updates->>'thumbnail_url', thumbnail_url),
    location = coalesce(p_updates->>'location', location),
    event_date = case
      when p_updates ? 'event_date' and nullif(p_updates->>'event_date', '') is not null
        then (p_updates->>'event_date')::date
      when p_updates ? 'event_date' then null
      else event_date
    end,
    status = case
      when exists (
        select 1 from public.profiles p
        where p.user_id = auth.uid() and coalesce(p.is_admin, false)
      ) then status
      else case when status in ('approved', 'flagged') then 'pending' else status end
    end
  where id = p_item_id;
end;
$$;

grant execute on function public.approve_event_scrapbook_item(uuid) to authenticated;
grant execute on function public.reject_event_scrapbook_item(uuid) to authenticated;
grant execute on function public.restore_event_scrapbook_item(uuid) to authenticated;
grant execute on function public.delete_event_scrapbook_item(uuid) to authenticated;
grant execute on function public.update_event_scrapbook_item(uuid, jsonb) to authenticated;

create unique index if not exists posts_event_scrapbook_unique
  on public.posts (event_id)
  where event_id is not null and content_type = 'event_scrapbook';

commit;
