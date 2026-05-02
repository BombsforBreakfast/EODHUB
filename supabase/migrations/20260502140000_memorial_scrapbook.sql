-- Memorial scrapbook: community contributions with admin review and flagging.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.memorial_scrapbook_items (
  id uuid primary key default gen_random_uuid(),
  memorial_id uuid not null references public.memorials (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  item_type text not null
    check (item_type in ('photo', 'article', 'document', 'memory')),
  file_url text,
  external_url text,
  thumbnail_url text,
  memory_body text,
  caption text,
  location text,
  event_date date,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'flagged')),
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id)
);

create index if not exists memorial_scrapbook_items_memorial_approved_created_idx
  on public.memorial_scrapbook_items (memorial_id, created_at desc)
  where status = 'approved';

create index if not exists memorial_scrapbook_items_admin_queue_idx
  on public.memorial_scrapbook_items (status, created_at desc)
  where status in ('pending', 'flagged');

create index if not exists memorial_scrapbook_items_memorial_id_idx
  on public.memorial_scrapbook_items (memorial_id);

create table if not exists public.memorial_scrapbook_flags (
  id uuid primary key default gen_random_uuid(),
  scrapbook_item_id uuid not null references public.memorial_scrapbook_items (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reason text not null
    check (reason in (
      'in_photo',
      'inappropriate',
      'incorrect',
      'duplicate',
      'other'
    )),
  details text,
  created_at timestamptz not null default now(),
  unique (scrapbook_item_id, user_id)
);

create index if not exists memorial_scrapbook_flags_item_idx
  on public.memorial_scrapbook_flags (scrapbook_item_id);

comment on table public.memorial_scrapbook_items is
  'Community scrapbook entries for a memorial; only approved rows are public.';
comment on column public.memorial_scrapbook_items.memory_body is
  'Long-form memory text when item_type = memory; caption remains optional context.';
comment on table public.memorial_scrapbook_flags is
  'User reports on approved scrapbook items; two unique flaggers auto-set item to flagged.';

-- ---------------------------------------------------------------------------
-- Validation trigger (insert)
-- ---------------------------------------------------------------------------

create or replace function public.trg_memorial_scrapbook_items_validate_ins()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status is distinct from 'pending' then
    raise exception 'Scrapbook items must be submitted as pending';
  end if;

  if not exists (select 1 from public.memorials m where m.id = new.memorial_id) then
    raise exception 'Memorial not found';
  end if;

  if new.item_type = 'photo' then
    if new.file_url is null or trim(new.file_url) = '' then
      raise exception 'Photo items require a file upload';
    end if;
  elsif new.item_type = 'document' then
    if new.file_url is null or trim(new.file_url) = '' then
      raise exception 'Document items require a file upload';
    end if;
  elsif new.item_type = 'article' then
    if new.external_url is null or trim(new.external_url) = '' then
      raise exception 'Article items require an external URL';
    end if;
  elsif new.item_type = 'memory' then
    if coalesce(trim(new.memory_body), '') = '' and coalesce(trim(new.caption), '') = '' then
      raise exception 'Memory items require text in the memory or caption field';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_memorial_scrapbook_items_validate_ins on public.memorial_scrapbook_items;
create trigger trg_memorial_scrapbook_items_validate_ins
  before insert on public.memorial_scrapbook_items
  for each row execute function public.trg_memorial_scrapbook_items_validate_ins();

-- ---------------------------------------------------------------------------
-- Auto-flag when two distinct users flag an approved item
-- ---------------------------------------------------------------------------

create or replace function public.trg_memorial_scrapbook_flags_after_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(distinct f.user_id) into n
  from public.memorial_scrapbook_flags f
  where f.scrapbook_item_id = new.scrapbook_item_id
    and f.user_id is not null;

  if n >= 2 then
    update public.memorial_scrapbook_items i
    set status = 'flagged'
    where i.id = new.scrapbook_item_id
      and i.status = 'approved';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_memorial_scrapbook_flags_after_ins on public.memorial_scrapbook_flags;
create trigger trg_memorial_scrapbook_flags_after_ins
  after insert on public.memorial_scrapbook_flags
  for each row execute function public.trg_memorial_scrapbook_flags_after_ins();

-- ---------------------------------------------------------------------------
-- RLS: items
-- ---------------------------------------------------------------------------

alter table public.memorial_scrapbook_items enable row level security;

drop policy if exists memorial_scrapbook_items_select_public on public.memorial_scrapbook_items;
create policy memorial_scrapbook_items_select_public
  on public.memorial_scrapbook_items
  for select
  using (status = 'approved');

drop policy if exists memorial_scrapbook_items_select_admin on public.memorial_scrapbook_items;
create policy memorial_scrapbook_items_select_admin
  on public.memorial_scrapbook_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists memorial_scrapbook_items_insert_own on public.memorial_scrapbook_items;
create policy memorial_scrapbook_items_insert_own
  on public.memorial_scrapbook_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- RLS: flags
-- ---------------------------------------------------------------------------

alter table public.memorial_scrapbook_flags enable row level security;

drop policy if exists memorial_scrapbook_flags_select_admin on public.memorial_scrapbook_flags;
create policy memorial_scrapbook_flags_select_admin
  on public.memorial_scrapbook_flags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );

drop policy if exists memorial_scrapbook_flags_insert_own on public.memorial_scrapbook_flags;
create policy memorial_scrapbook_flags_insert_own
  on public.memorial_scrapbook_flags
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.memorial_scrapbook_items i
      where i.id = scrapbook_item_id
        and i.status = 'approved'
    )
  );

-- ---------------------------------------------------------------------------
-- Admin RPCs (mutations bypass RLS via security definer)
-- ---------------------------------------------------------------------------

create or replace function public.approve_memorial_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;

  update public.memorial_scrapbook_items
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_item_id
    and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Item not found or not pending';
  end if;
end;
$$;

create or replace function public.reject_memorial_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;

  update public.memorial_scrapbook_items
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_item_id
    and status = 'pending';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Item not found or not pending';
  end if;
end;
$$;

create or replace function public.restore_memorial_scrapbook_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if not exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and coalesce(p.is_admin, false)
  ) then
    raise exception 'Forbidden';
  end if;

  update public.memorial_scrapbook_items
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_item_id
    and status = 'flagged';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Item not found or not flagged';
  end if;
end;
$$;

create or replace function public.delete_memorial_scrapbook_item(p_item_id uuid)
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

  delete from public.memorial_scrapbook_items where id = p_item_id;
end;
$$;

grant execute on function public.approve_memorial_scrapbook_item(uuid) to authenticated;
grant execute on function public.reject_memorial_scrapbook_item(uuid) to authenticated;
grant execute on function public.restore_memorial_scrapbook_item(uuid) to authenticated;
grant execute on function public.delete_memorial_scrapbook_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket memorial-scrapbook
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('memorial-scrapbook', 'memorial-scrapbook', true)
on conflict (id) do nothing;

drop policy if exists memorial_scrapbook_objects_public_read on storage.objects;
create policy memorial_scrapbook_objects_public_read
  on storage.objects
  for select
  using (bucket_id = 'memorial-scrapbook');

drop policy if exists memorial_scrapbook_objects_insert_own on storage.objects;
create policy memorial_scrapbook_objects_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'memorial-scrapbook'
    and split_part(name, '/', 2) = auth.uid()::text
    and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and array_length(string_to_array(name, '/'), 1) >= 3
  );

drop policy if exists memorial_scrapbook_objects_delete_own on storage.objects;
create policy memorial_scrapbook_objects_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'memorial-scrapbook'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists memorial_scrapbook_objects_admin_all on storage.objects;
create policy memorial_scrapbook_objects_admin_all
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'memorial-scrapbook'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  )
  with check (
    bucket_id = 'memorial-scrapbook'
    and exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and coalesce(p.is_admin, false)
    )
  );
