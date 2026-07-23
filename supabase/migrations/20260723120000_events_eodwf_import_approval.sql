-- EODWF events import: approval queue + source dedupe.
-- Manual creates stay live (is_approved default true).
-- Imports insert is_approved = false until an admin approves.

begin;

alter table public.events
  add column if not exists is_approved boolean not null default true,
  add column if not exists source_type text,
  add column if not exists source_url text,
  add column if not exists source_event_id text,
  add column if not exists import_metadata jsonb;

comment on column public.events.is_approved is
  'When false, event is pending admin review and hidden from public calendar/feed.';
comment on column public.events.source_type is
  'Import origin: eodwf_calendar | eodwf_gathering | eodwf_retreat; null for manual.';
comment on column public.events.source_url is
  'Canonical source URL or synthetic key used for import dedupe.';
comment on column public.events.source_event_id is
  'External id (e.g. Tribe Events id) when available.';
comment on column public.events.import_metadata is
  'Raw scrape/debug metadata for pending imports.';

alter table public.events
  drop constraint if exists events_source_type_check;

alter table public.events
  add constraint events_source_type_check
  check (
    source_type is null
    or source_type in ('eodwf_calendar', 'eodwf_gathering', 'eodwf_retreat')
  );

create unique index if not exists events_source_type_url_uidx
  on public.events (source_type, source_url)
  where source_type is not null and source_url is not null;

create index if not exists idx_events_pending_approval
  on public.events (created_at desc)
  where is_approved = false;

-- Public select: only approved events (admins still see all via events_admin_all).
drop policy if exists events_select_visible on public.events;
create policy events_select_visible
  on public.events
  for select
  to anon, authenticated
  using (
    coalesce(is_approved, true) = true
    and (
      (coalesce(visibility, 'public') = 'public' and unit_id is null)
      or (
        auth.role() = 'authenticated'
        and coalesce(visibility, 'public') = 'group'
        and unit_id is not null
        and exists (
          select 1
          from public.unit_members um
          where um.unit_id = events.unit_id
            and um.user_id = auth.uid()
            and um.status = 'approved'
        )
      )
    )
  );

-- Linked feed post: only when public + approved.
-- Fire on insert (manual approved creates) and on approve (false → true).
create or replace function public._create_event_linked_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_uid uuid;
begin
  if new.unit_id is not null then
    return new;
  end if;
  if coalesce(new.visibility, 'public') <> 'public' then
    return new;
  end if;
  if coalesce(new.is_approved, true) <> true then
    return new;
  end if;

  -- On UPDATE, only act when approval flips to true.
  if tg_op = 'UPDATE' then
    if coalesce(old.is_approved, true) = true then
      return new;
    end if;
  end if;

  select p.user_id
    into v_admin_uid
  from public.profiles p
  where lower(coalesce(p.email, '')) = 'hello@eod-hub.com'
  limit 1;

  insert into public.posts (user_id, content, created_at, event_id, content_type)
  select coalesce(v_admin_uid, new.user_id), '', coalesce(new.created_at, now()), new.id, 'event_publish'
  where not exists (
    select 1
    from public.posts p
    where p.event_id = new.id
      and coalesce(p.content_type, 'event_publish') = 'event_publish'
  );

  return new;
end;
$$;

drop trigger if exists trg_events_create_linked_post on public.events;
create trigger trg_events_create_linked_post
  after insert on public.events
  for each row
  execute function public._create_event_linked_post();

drop trigger if exists trg_events_approve_linked_post on public.events;
create trigger trg_events_approve_linked_post
  after update of is_approved on public.events
  for each row
  execute function public._create_event_linked_post();

commit;
