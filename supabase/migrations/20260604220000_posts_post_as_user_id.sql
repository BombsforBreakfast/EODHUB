-- Optional feed author override for allowlisted staff (post as EOD HUB admin identity).

begin;

alter table public.posts
  add column if not exists post_as_user_id uuid references auth.users (id) on delete set null;

create index if not exists posts_post_as_user_id_idx
  on public.posts (post_as_user_id)
  where post_as_user_id is not null;

comment on column public.posts.post_as_user_id is
  'When set, feed UI shows this profile as the post author instead of user_id.';

create or replace function public.validate_post_as_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_email text;
  v_admin_uid uuid;
begin
  if new.post_as_user_id is null then
    return new;
  end if;

  select lower(u.email)
  into v_caller_email
  from auth.users u
  where u.id = auth.uid();

  if v_caller_email is distinct from 'micheal.p.twigg@gmail.com' then
    raise exception 'post_as identity is not allowed for this account';
  end if;

  select p.user_id
  into v_admin_uid
  from public.profiles p
  where lower(coalesce(p.email, '')) = 'hello@eod-hub.com'
  limit 1;

  if new.post_as_user_id not in (auth.uid(), v_admin_uid) then
    raise exception 'invalid post_as_user_id';
  end if;

  return new;
end;
$$;

drop trigger if exists posts_post_as_user_id_validate on public.posts;
create trigger posts_post_as_user_id_validate
  before insert or update of post_as_user_id
  on public.posts
  for each row
  execute function public.validate_post_as_user_id();

drop function if exists public.create_feed_post_with_kangaroo_court(text, text, text, text, text, text, text, text[], text[], int);

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
  p_duration_hours int,
  p_post_as_user_id uuid default null
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
    post_as_user_id,
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
    p_post_as_user_id,
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

revoke all on function public.create_feed_post_with_kangaroo_court(text, text, text, text, text, text, text, text[], text[], int, uuid) from public;
grant execute on function public.create_feed_post_with_kangaroo_court(text, text, text, text, text, text, text, text[], text[], int, uuid) to authenticated;

commit;
