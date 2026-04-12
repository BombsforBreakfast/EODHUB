-- Kangaroo Court in-app notifications (same create_notification / notifications table as the rest of the app).
-- Types: kangaroo_court_opened, kangaroo_court_verdict

begin;

-- Extend create_notification with optional post_id (feed deep links + group_key alignment).
drop function if exists public.create_notification(
  uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, text, text, text, text, text, jsonb
);

create or replace function public.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid default null,
  p_actor_name text default null,
  p_post_owner_id uuid default null,
  p_type text default null,
  p_category text default 'system',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_parent_entity_type text default null,
  p_parent_entity_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_message text default null,
  p_link text default null,
  p_group_key text default null,
  p_dedupe_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_post_id uuid default null
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notifications%rowtype;
  v_message text;
  v_group_key text;
begin
  if p_recipient_user_id is null then
    raise exception 'recipient_user_id is required';
  end if;

  if p_actor_user_id is not null and p_actor_user_id = p_recipient_user_id then
    select * into v_row from public.notifications where false;
    return v_row;
  end if;

  if p_dedupe_key is not null then
    select *
    into v_row
    from public.notifications n
    where n.recipient_user_id = p_recipient_user_id
      and n.dedupe_key = p_dedupe_key
      and n.archived_at is null
    order by n.created_at desc
    limit 1;

    if found then
      return v_row;
    end if;
  end if;

  v_message := coalesce(nullif(p_message, ''), concat_ws(' - ', nullif(p_title, ''), nullif(p_body, '')), coalesce(p_type, 'Notification'));
  v_group_key := coalesce(
    nullif(p_group_key, ''),
    case
      when p_post_id is not null then 'post:' || p_post_id::text || ':' || coalesce(p_type, 'activity')
      else 'notification:' || coalesce(p_entity_id::text, gen_random_uuid()::text)
    end
  );

  insert into public.notifications (
    recipient_user_id,
    user_id,
    actor_user_id,
    actor_id,
    type,
    category,
    entity_type,
    entity_id,
    parent_entity_type,
    parent_entity_id,
    actor_name,
    post_owner_id,
    message,
    link,
    group_key,
    dedupe_key,
    metadata,
    post_id,
    is_read,
    read_at,
    archived_at
  )
  values (
    p_recipient_user_id,
    p_recipient_user_id,
    p_actor_user_id,
    p_actor_user_id,
    coalesce(p_type, 'generic'),
    coalesce(p_category, 'system'),
    p_entity_type,
    p_entity_id,
    p_parent_entity_type,
    p_parent_entity_id,
    p_actor_name,
    p_post_owner_id,
    v_message,
    p_link,
    v_group_key,
    p_dedupe_key,
    coalesce(p_metadata, '{}'::jsonb),
    p_post_id,
    false,
    null,
    null
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_notification(
  uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, text, text, text, text, text, jsonb, uuid
) from public;
grant execute on function public.create_notification(
  uuid, uuid, text, uuid, text, text, text, uuid, text, uuid, text, text, text, text, text, text, jsonb, uuid
) to authenticated, service_role;

-- Notify post author when someone else opens KC on their feed post.
create or replace function public.open_kangaroo_court_on_feed_post(
  p_feed_post_id uuid,
  p_option_labels text[],
  p_duration_hours int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_court_id uuid;
  v_expires timestamptz;
  i int;
  v_label text;
  n int;
  v_post_owner uuid;
  v_opener_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not public._kc_feed_post_eligible(p_feed_post_id) then
    raise exception 'Post is not eligible for Kangaroo Court';
  end if;

  if exists (
    select 1 from public.kangaroo_courts k
    where k.feed_post_id = p_feed_post_id and k.status = 'active'
  ) then
    raise exception 'A court is already active on this post';
  end if;

  n := coalesce(array_length(p_option_labels, 1), 0);
  if n < 2 or n > 4 then
    raise exception 'Between 2 and 4 options required';
  end if;

  if p_duration_hours is null or p_duration_hours not in (1, 6, 12, 24) then
    raise exception 'Invalid duration';
  end if;

  select p.user_id into v_post_owner
  from public.posts p
  where p.id = p_feed_post_id;

  select coalesce(
    (select coalesce(
      nullif(trim(display_name), ''),
      nullif(trim(first_name), ''),
      'Someone'
    )
    from public.profiles
    where user_id = v_uid),
    'Someone'
  ) into v_opener_name;

  v_expires := now() + (p_duration_hours || ' hours')::interval;

  insert into public.kangaroo_courts (
    feed_post_id,
    unit_post_id,
    unit_id,
    opened_by,
    status,
    duration_hours,
    expires_at,
    source
  ) values (
    p_feed_post_id,
    null,
    null,
    v_uid,
    'active',
    p_duration_hours,
    v_expires,
    'convert_existing'
  )
  returning id into v_court_id;

  for i in 1..n loop
    v_label := trim(p_option_labels[i]);
    if length(v_label) = 0 then
      raise exception 'Empty option label';
    end if;
    insert into public.kangaroo_court_options (court_id, label, sort_order)
    values (v_court_id, v_label, i - 1);
  end loop;

  if v_post_owner is not null and v_post_owner is distinct from v_uid then
    perform public.create_notification(
      p_recipient_user_id := v_post_owner,
      p_actor_user_id := v_uid,
      p_actor_name := v_opener_name,
      p_post_owner_id := v_post_owner,
      p_type := 'kangaroo_court_opened',
      p_category := 'social',
      p_entity_type := 'post',
      p_entity_id := p_feed_post_id,
      p_parent_entity_type := 'kangaroo_court',
      p_parent_entity_id := v_court_id,
      p_message := 'Kangaroo Court opened on your post',
      p_link := '/?postId=' || p_feed_post_id::text,
      p_dedupe_key := 'kc_opened:' || v_court_id::text,
      p_metadata := jsonb_build_object('court_id', v_court_id, 'feed_post_id', p_feed_post_id),
      p_post_id := p_feed_post_id
    );
  end if;

  return v_court_id;
end;
$$;

revoke all on function public.open_kangaroo_court_on_feed_post(uuid, text[], int) from public;
grant execute on function public.open_kangaroo_court_on_feed_post(uuid, text[], int) to authenticated;

-- Verdict notifications: one per distinct recipient (author, opener, voters); idempotent via dedupe_key.
create or replace function public.close_expired_kangaroo_courts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court record;
  v_winner_id uuid;
  v_winner_label text;
  v_winner_cnt int;
  v_pct int;
  v_total int;
  v_body text;
  n_closed int := 0;
  v_post_owner uuid;
begin
  for v_court in
    select k.id, k.feed_post_id, k.total_votes, k.opened_by
    from public.kangaroo_courts k
    where k.status = 'active'
      and k.feed_post_id is not null
      and k.expires_at <= now()
    for update of k
  loop
    v_total := coalesce(v_court.total_votes, 0);

    select o.id, o.label, coalesce(c.cnt, 0)::int
    into v_winner_id, v_winner_label, v_winner_cnt
    from public.kangaroo_court_options o
    left join (
      select option_id, count(*)::int as cnt
      from public.kangaroo_court_votes
      where court_id = v_court.id
      group by option_id
    ) c on c.option_id = o.id
    where o.court_id = v_court.id
    order by coalesce(c.cnt, 0) desc, o.sort_order asc
    limit 1;

    if v_total > 0 and v_winner_cnt is not null then
      v_pct := round(100.0 * v_winner_cnt::numeric / v_total::numeric);
    else
      v_pct := 0;
    end if;

    v_body := format(
      E'Judge N. E. W.\nNewton E. Wentworth, Honorable\n\nThe court has reviewed the evidence.\nVerdict: %s\n%s%% of %s votes. Case closed.',
      v_winner_label,
      v_pct,
      v_total
    );

    insert into public.kangaroo_court_verdicts (court_id, winning_option_id, winning_label_snapshot, total_votes, body)
    values (v_court.id, v_winner_id, v_winner_label, v_total, v_body);

    update public.kangaroo_courts
    set status = 'closed',
        closed_at = now(),
        winning_option_id = v_winner_id
    where id = v_court.id;

    update public.posts
    set court_verdict_at = now()
    where id = v_court.feed_post_id;

    select p.user_id into v_post_owner
    from public.posts p
    where p.id = v_court.feed_post_id;

    for v_recipient in
      select distinct x.uid
      from (
        select v_post_owner as uid
        union all
        select v_court.opened_by as uid
        union all
        select v.user_id as uid
        from public.kangaroo_court_votes v
        where v.court_id = v_court.id
      ) x
      where x.uid is not null
    loop
      perform public.create_notification(
        p_recipient_user_id := v_recipient,
        p_actor_user_id := null,
        p_actor_name := 'Judge N. E. W.',
        p_post_owner_id := null,
        p_type := 'kangaroo_court_verdict',
        p_category := 'social',
        p_entity_type := 'post',
        p_entity_id := v_court.feed_post_id,
        p_parent_entity_type := 'kangaroo_court',
        p_parent_entity_id := v_court.id,
        p_message := 'Verdict is in — Judge N. E. W. has ruled.',
        p_link := '/?postId=' || v_court.feed_post_id::text,
        p_dedupe_key := 'kc_verdict:' || v_court.id::text || ':' || v_recipient::text,
        p_metadata := jsonb_build_object('court_id', v_court.id, 'feed_post_id', v_court.feed_post_id),
        p_post_id := v_court.feed_post_id
      );
    end loop;

    n_closed := n_closed + 1;
  end loop;

  return n_closed;
end;
$$;

revoke all on function public.close_expired_kangaroo_courts() from public;
grant execute on function public.close_expired_kangaroo_courts() to authenticated, service_role;

commit;
