begin;

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

update public.posts p
set user_id = admin_profile.user_id
from (
  select user_id
  from public.profiles
  where lower(coalesce(email, '')) = 'hello@eod-hub.com'
  limit 1
) admin_profile
where p.event_id is not null
  and coalesce(p.content_type, 'event_publish') in ('event_publish', 'event_scrapbook');

commit;
