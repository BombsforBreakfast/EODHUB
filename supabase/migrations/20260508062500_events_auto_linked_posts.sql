begin;

-- Prevent duplicate social posts for the same linked event.
create unique index if not exists posts_event_id_unique
  on public.posts (event_id)
  where event_id is not null;

create or replace function public._create_event_linked_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only auto-create a main social feed post for public/global events.
  if new.unit_id is not null then
    return new;
  end if;
  if coalesce(new.visibility, 'public') <> 'public' then
    return new;
  end if;

  insert into public.posts (user_id, content, created_at, event_id)
  select new.user_id, '', coalesce(new.created_at, now()), new.id
  where not exists (
    select 1 from public.posts p where p.event_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists trg_events_create_linked_post on public.events;
create trigger trg_events_create_linked_post
  after insert on public.events
  for each row
  execute function public._create_event_linked_post();

create or replace function public._delete_event_linked_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Keep feed/wall clean: deleting an event removes its linked social post.
  delete from public.posts where event_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_events_delete_linked_post on public.events;
create trigger trg_events_delete_linked_post
  before delete on public.events
  for each row
  execute function public._delete_event_linked_post();

commit;
