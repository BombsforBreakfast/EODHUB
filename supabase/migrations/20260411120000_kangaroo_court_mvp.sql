-- Kangaroo Court MVP: courts, options, votes, verdicts + bump columns

begin;

alter table public.posts
  add column if not exists court_verdict_at timestamptz;

alter table public.unit_posts
  add column if not exists court_verdict_at timestamptz;

create index if not exists idx_posts_court_verdict_at
  on public.posts (court_verdict_at desc nulls last)
  where court_verdict_at is not null;

create index if not exists idx_unit_posts_court_verdict_at
  on public.unit_posts (court_verdict_at desc nulls last)
  where court_verdict_at is not null;

create table if not exists public.kangaroo_courts (
  id uuid primary key default gen_random_uuid(),
  feed_post_id uuid references public.posts (id) on delete cascade,
  unit_post_id uuid references public.unit_posts (id) on delete cascade,
  unit_id uuid references public.units (id) on delete cascade,
  opened_by uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  duration_hours int not null check (duration_hours in (1, 6, 12, 24)),
  expires_at timestamptz not null,
  closed_at timestamptz,
  winning_option_id uuid,
  total_votes int not null default 0,
  source text not null default 'composer' check (source in ('composer', 'convert_existing')),
  created_at timestamptz not null default now(),
  constraint kangaroo_courts_target_chk check (
    (
      feed_post_id is not null
      and unit_post_id is null
      and unit_id is null
    )
    or (
      feed_post_id is null
      and unit_post_id is not null
      and unit_id is not null
    )
  )
);

create unique index if not exists idx_kangaroo_courts_one_active_feed_post
  on public.kangaroo_courts (feed_post_id)
  where status = 'active' and feed_post_id is not null;

create unique index if not exists idx_kangaroo_courts_one_active_unit_post
  on public.kangaroo_courts (unit_post_id)
  where status = 'active' and unit_post_id is not null;

create index if not exists idx_kangaroo_courts_feed_post on public.kangaroo_courts (feed_post_id);
create index if not exists idx_kangaroo_courts_unit_post on public.kangaroo_courts (unit_post_id);
create index if not exists idx_kangaroo_courts_expires on public.kangaroo_courts (expires_at) where status = 'active';

create table if not exists public.kangaroo_court_options (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.kangaroo_courts (id) on delete cascade,
  label text not null,
  sort_order int not null check (sort_order >= 0 and sort_order < 4),
  created_at timestamptz not null default now()
);

create index if not exists idx_kangaroo_court_options_court on public.kangaroo_court_options (court_id);

alter table public.kangaroo_courts
  add constraint kangaroo_courts_winning_option_fk
  foreign key (winning_option_id) references public.kangaroo_court_options (id) on delete set null;

create table if not exists public.kangaroo_court_votes (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.kangaroo_courts (id) on delete cascade,
  option_id uuid not null references public.kangaroo_court_options (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (court_id, user_id)
);

create index if not exists idx_kangaroo_court_votes_court on public.kangaroo_court_votes (court_id);
create index if not exists idx_kangaroo_court_votes_option on public.kangaroo_court_votes (option_id);

create table if not exists public.kangaroo_court_verdicts (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null unique references public.kangaroo_courts (id) on delete cascade,
  winning_option_id uuid references public.kangaroo_court_options (id) on delete set null,
  winning_label_snapshot text not null,
  total_votes int not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.kangaroo_courts enable row level security;
alter table public.kangaroo_court_options enable row level security;
alter table public.kangaroo_court_votes enable row level security;
alter table public.kangaroo_court_verdicts enable row level security;

drop policy if exists "kangaroo_courts_select_authenticated" on public.kangaroo_courts;
create policy "kangaroo_courts_select_authenticated"
  on public.kangaroo_courts for select
  to authenticated
  using (true);

drop policy if exists "kangaroo_court_options_select_authenticated" on public.kangaroo_court_options;
create policy "kangaroo_court_options_select_authenticated"
  on public.kangaroo_court_options for select
  to authenticated
  using (true);

drop policy if exists "kangaroo_court_votes_select_authenticated" on public.kangaroo_court_votes;
create policy "kangaroo_court_votes_select_authenticated"
  on public.kangaroo_court_votes for select
  to authenticated
  using (true);

drop policy if exists "kangaroo_court_verdicts_select_authenticated" on public.kangaroo_court_verdicts;
create policy "kangaroo_court_verdicts_select_authenticated"
  on public.kangaroo_court_verdicts for select
  to authenticated
  using (true);

create or replace function public._kc_feed_post_eligible(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.wall_user_id is null
      and coalesce(p.hidden_for_review, false) = false
  );
$$;

create or replace function public.create_feed_post_with_kangaroo_court(
  p_content text,
  p_gif_url text,
  p_og_url text,
  p_og_title text,
  p_og_description text,
  p_og_image text,
  p_og_site_name text,
  p_image_urls text[],
  p_option_labels text[],
  p_duration_hours int
)
returns table (post_id uuid, court_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_id uuid;
  v_court_id uuid;
  v_expires timestamptz;
  i int;
  v_label text;
  n int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_option_labels is null or array_length(p_option_labels, 1) is null then
    raise exception 'Options required';
  end if;

  n := array_length(p_option_labels, 1);
  if n < 2 or n > 4 then
    raise exception 'Between 2 and 4 options required';
  end if;

  if p_duration_hours is null or p_duration_hours not in (1, 6, 12, 24) then
    raise exception 'Invalid duration';
  end if;

  v_expires := now() + (p_duration_hours || ' hours')::interval;

  insert into public.posts (
    user_id,
    content,
    image_url,
    gif_url,
    og_url,
    og_title,
    og_description,
    og_image,
    og_site_name
  ) values (
    v_uid,
    coalesce(nullif(trim(p_content), ''), ''),
    null,
    nullif(trim(p_gif_url), ''),
    nullif(trim(p_og_url), ''),
    nullif(trim(p_og_title), ''),
    nullif(trim(p_og_description), ''),
    nullif(trim(p_og_image), ''),
    nullif(trim(p_og_site_name), '')
  )
  returning id into v_post_id;

  if p_image_urls is not null and array_length(p_image_urls, 1) > 0 then
    for i in 1..array_length(p_image_urls, 1) loop
      insert into public.post_images (post_id, image_url, sort_order)
      values (v_post_id, trim(p_image_urls[i]), i - 1);
    end loop;
    update public.posts set image_url = trim(p_image_urls[1]) where id = v_post_id;
  end if;

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
    v_post_id,
    null,
    null,
    v_uid,
    'active',
    p_duration_hours,
    v_expires,
    'composer'
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

  return query select v_post_id, v_court_id;
end;
$$;

revoke all on function public.create_feed_post_with_kangaroo_court(text, text, text, text, text, text, text, text[], text[], int) from public;
grant execute on function public.create_feed_post_with_kangaroo_court(text, text, text, text, text, text, text, text[], text[], int) to authenticated;

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

  return v_court_id;
end;
$$;

revoke all on function public.open_kangaroo_court_on_feed_post(uuid, text[], int) from public;
grant execute on function public.open_kangaroo_court_on_feed_post(uuid, text[], int) to authenticated;

create or replace function public.vote_kangaroo_court(p_court_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_court public.kangaroo_courts%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_court from public.kangaroo_courts where id = p_court_id for update;
  if not found then
    raise exception 'Court not found';
  end if;

  if v_court.status <> 'active' then
    raise exception 'Voting is closed';
  end if;

  if v_court.expires_at <= now() then
    raise exception 'Voting is closed';
  end if;

  if not exists (
    select 1 from public.kangaroo_court_options o
    where o.id = p_option_id and o.court_id = p_court_id
  ) then
    raise exception 'Invalid option';
  end if;

  insert into public.kangaroo_court_votes (court_id, option_id, user_id)
  values (p_court_id, p_option_id, v_uid);

  update public.kangaroo_courts
  set total_votes = total_votes + 1
  where id = p_court_id;
exception
  when unique_violation then
    raise exception 'Already voted';
end;
$$;

revoke all on function public.vote_kangaroo_court(uuid, uuid) from public;
grant execute on function public.vote_kangaroo_court(uuid, uuid) to authenticated;

-- Close expired feed courts: winner by max votes, tie-break lowest sort_order
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
begin
  for v_court in
    select k.id, k.feed_post_id, k.total_votes
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
      E'Judge N. E. W.\nNewton E. Wentworth, Presiding\n\nThe court has reviewed the evidence.\nVerdict: %s\n%s%% of %s votes. Case closed.',
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

    n_closed := n_closed + 1;
  end loop;

  return n_closed;
end;
$$;

revoke all on function public.close_expired_kangaroo_courts() from public;
grant execute on function public.close_expired_kangaroo_courts() to authenticated, service_role;

commit;
