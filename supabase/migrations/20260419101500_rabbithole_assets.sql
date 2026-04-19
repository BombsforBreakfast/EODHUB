-- RabbitHole asset storage metadata
-- Keeps provider details portable and decoupled from RabbitHole item metadata.

create table if not exists public.rabbithole_assets (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.rabbithole_contributions(id) on delete cascade,
  storage_provider text not null,
  bucket text not null,
  object_key text not null,
  original_filename text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  access_level text not null default 'private' check (access_level in ('public', 'private', 'team')),
  status text not null default 'ready' check (status in ('uploaded', 'processing', 'ready', 'failed', 'deleted')),
  is_primary boolean not null default false,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_provider, bucket, object_key)
);

create index if not exists rabbithole_assets_contribution_idx
  on public.rabbithole_assets (contribution_id, created_at asc);

create index if not exists rabbithole_assets_provider_locator_idx
  on public.rabbithole_assets (storage_provider, bucket, object_key);

create index if not exists rabbithole_assets_status_idx
  on public.rabbithole_assets (status);

create index if not exists rabbithole_assets_mime_idx
  on public.rabbithole_assets (mime_type);

create or replace function public.rabbithole_assets_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rabbithole_assets_touch_updated_at on public.rabbithole_assets;
create trigger rabbithole_assets_touch_updated_at
before update on public.rabbithole_assets
for each row execute function public.rabbithole_assets_touch_updated_at();

alter table public.rabbithole_assets enable row level security;

drop policy if exists rabbithole_assets_select_authenticated on public.rabbithole_assets;
create policy rabbithole_assets_select_authenticated
on public.rabbithole_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.rabbithole_contributions c
    where c.id = contribution_id
      and (c.status = 'active' or c.created_by = auth.uid())
  )
);

drop policy if exists rabbithole_assets_insert_own on public.rabbithole_assets;
create policy rabbithole_assets_insert_own
on public.rabbithole_assets
for insert
to authenticated
with check (uploaded_by = auth.uid());

drop policy if exists rabbithole_assets_update_own on public.rabbithole_assets;
create policy rabbithole_assets_update_own
on public.rabbithole_assets
for update
to authenticated
using (uploaded_by = auth.uid())
with check (uploaded_by = auth.uid());

drop policy if exists rabbithole_assets_delete_own on public.rabbithole_assets;
create policy rabbithole_assets_delete_own
on public.rabbithole_assets
for delete
to authenticated
using (uploaded_by = auth.uid());
