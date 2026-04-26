-- Enforce at most one saved_events row per (user_id, event_id). Removes duplicate
-- rows (keeps the newest by created_at, then id) and adds a unique index.

begin;

-- Drop duplicates: keep the row with latest created_at (then largest id) per pair.
delete from public.saved_events
where id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by user_id, event_id
        order by created_at desc nulls last, id desc
      ) as rn
    from public.saved_events
  ) t
  where t.rn > 1
);

create unique index if not exists saved_events_user_id_event_id_uidx
  on public.saved_events (user_id, event_id);

commit;
