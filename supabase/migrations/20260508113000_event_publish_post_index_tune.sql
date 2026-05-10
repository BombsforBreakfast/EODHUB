begin;

drop index if exists public.posts_event_id_unique;

delete from public.posts
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by event_id
        order by created_at desc nulls last, id desc
      ) as rn
    from public.posts
    where event_id is not null
      and coalesce(content_type, 'event_publish') = 'event_publish'
  ) t
  where t.rn > 1
);

create unique index if not exists posts_event_publish_unique
  on public.posts (event_id)
  where event_id is not null and coalesce(content_type, 'event_publish') = 'event_publish';

create or replace function public._create_event_linked_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unit_id is not null then
    return new;
  end if;
  if coalesce(new.visibility, 'public') <> 'public' then
    return new;
  end if;

  insert into public.posts (user_id, content, created_at, event_id, content_type)
  select new.user_id, '', coalesce(new.created_at, now()), new.id, 'event_publish'
  where not exists (
    select 1
    from public.posts p
    where p.event_id = new.id
      and coalesce(p.content_type, 'event_publish') = 'event_publish'
  );

  return new;
end;
$$;

commit;
