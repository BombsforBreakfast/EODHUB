-- Privacy settings, v1.
--
-- Adds five user-tunable privacy controls to public.profiles, a helper that
-- centralizes the "can viewer see target's content at this level" check, and
-- additive RESTRICTIVE RLS policies on the two scoped tables that hold
-- per-user content (posts.wall_user_id rows + profile_photos).
--
-- RESTRICTIVE policies are used so we don't have to know or touch the existing
-- PERMISSIVE read policies on those tables — Postgres ANDs restrictive policies
-- with the union of permissive ones, so this is a pure tightening gate.
--
-- The umbrella "profile visibility" lever is intentionally NOT enforced here:
-- gating profiles SELECT in RLS would cascade through every author/comment/
-- mention/presence read in the app. Out of scope for this migration.

begin;

-- 1. Privacy columns on profiles. Defaults preserve current behavior for
-- everyone already in the table.

alter table public.profiles
  add column if not exists privacy_wall_posts text not null default 'public',
  add column if not exists privacy_wall_photos text not null default 'public',
  add column if not exists privacy_show_online boolean not null default true,
  add column if not exists privacy_discoverable boolean not null default true,
  add column if not exists privacy_who_can_request text not null default 'everyone';

-- Note: privacy_who_can_request 'connections' means "users with at least one
-- mutual accepted connection" (friends-of-friends). My direct accepted
-- connections wouldn't be sending me requests — they're already connected.

alter table public.profiles
  drop constraint if exists profiles_privacy_wall_posts_check;
alter table public.profiles
  add constraint profiles_privacy_wall_posts_check
  check (privacy_wall_posts in ('private', 'connections', 'public'));

alter table public.profiles
  drop constraint if exists profiles_privacy_wall_photos_check;
alter table public.profiles
  add constraint profiles_privacy_wall_photos_check
  check (privacy_wall_photos in ('private', 'connections', 'public'));

alter table public.profiles
  drop constraint if exists profiles_privacy_who_can_request_check;
alter table public.profiles
  add constraint profiles_privacy_who_can_request_check
  check (privacy_who_can_request in ('everyone', 'connections', 'nobody'));

comment on column public.profiles.privacy_wall_posts is
  'Visibility of posts where wall_user_id = this user. private | connections | public.';
comment on column public.profiles.privacy_wall_photos is
  'Visibility of profile_photos rows owned by this user. private | connections | public.';
comment on column public.profiles.privacy_show_online is
  'When false, this user is not broadcast in the realtime presence strip.';
comment on column public.profiles.privacy_discoverable is
  'When false, exclude this user from People You May Know and similar suggestion surfaces.';
comment on column public.profiles.privacy_who_can_request is
  'Who is allowed to send this user a connection (Know) request. everyone | connections | nobody. "connections" = friends-of-friends (at least one mutual accepted connection).';

-- 2. Centralized visibility helper.
--
-- SECURITY DEFINER so RLS policies can call it without recursing back through
-- profile_connections RLS for the visibility check. The function only reads
-- profile_connections membership for the (viewer, target) pair, so it leaks
-- no data beyond a boolean.

create or replace function public.can_view_user(
  viewer uuid,
  target uuid,
  level text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target is null then true
    when viewer is not null and viewer = target then true
    when level = 'public' then viewer is not null
    when level = 'connections' then
      viewer is not null
      and exists (
        select 1
        from public.profile_connections pc
        where pc.status = 'accepted'
          and (
            (pc.requester_user_id = viewer and pc.target_user_id = target)
            or (pc.requester_user_id = target and pc.target_user_id = viewer)
          )
      )
    when level = 'private' then false
    else false
  end;
$$;

revoke all on function public.can_view_user(uuid, uuid, text) from public;
grant execute on function public.can_view_user(uuid, uuid, text) to anon, authenticated;

-- Friends-of-friends helper. Returns true when users a and b share at least
-- one mutual user that has an accepted connection with each of them.
-- SECURITY DEFINER so it can read profile_connections without recursing
-- through that table's RLS for the membership check.

create or replace function public.users_share_accepted_connection(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with
    a_friends as (
      select case when requester_user_id = a then target_user_id else requester_user_id end as friend_id
      from public.profile_connections
      where status = 'accepted'
        and (requester_user_id = a or target_user_id = a)
    ),
    b_friends as (
      select case when requester_user_id = b then target_user_id else requester_user_id end as friend_id
      from public.profile_connections
      where status = 'accepted'
        and (requester_user_id = b or target_user_id = b)
    )
  select a is not null
     and b is not null
     and a <> b
     and exists (select 1 from a_friends af join b_friends bf on af.friend_id = bf.friend_id);
$$;

revoke all on function public.users_share_accepted_connection(uuid, uuid) from public;
grant execute on function public.users_share_accepted_connection(uuid, uuid) to authenticated;

-- 3. RESTRICTIVE policy on posts: wall posts honor the wall owner's setting.
--
-- Posts not addressed to a wall (wall_user_id is null) are unaffected.
-- Posts authored by the viewer themselves (or addressed to their own wall)
-- always pass.

alter table public.posts enable row level security;

drop policy if exists posts_wall_privacy_restrict on public.posts;
create policy posts_wall_privacy_restrict
  on public.posts
  as restrictive
  for select
  using (
    wall_user_id is null
    or auth.uid() = wall_user_id
    or auth.uid() = user_id
    or public.can_view_user(
      auth.uid(),
      wall_user_id,
      coalesce(
        (select p.privacy_wall_posts from public.profiles p where p.user_id = posts.wall_user_id),
        'public'
      )
    )
  );

-- 4. RESTRICTIVE policy on profile_photos: photos honor the owner's setting.

alter table public.profile_photos enable row level security;

drop policy if exists profile_photos_privacy_restrict on public.profile_photos;
create policy profile_photos_privacy_restrict
  on public.profile_photos
  as restrictive
  for select
  using (
    auth.uid() = user_id
    or public.can_view_user(
      auth.uid(),
      user_id,
      coalesce(
        (select p.privacy_wall_photos from public.profiles p where p.user_id = profile_photos.user_id),
        'public'
      )
    )
  );

-- 5. RESTRICTIVE policy on profile_connections insert: respect "who can
-- request" on the target. Layered on top of the existing permissive insert
-- policy so the pending-status / requester-self checks still apply.

drop policy if exists profile_connections_request_gate on public.profile_connections;
create policy profile_connections_request_gate
  on public.profile_connections
  as restrictive
  for insert
  with check (
    case coalesce(
      (select p.privacy_who_can_request from public.profiles p where p.user_id = target_user_id),
      'everyone'
    )
      when 'everyone' then true
      when 'connections' then public.users_share_accepted_connection(auth.uid(), target_user_id)
      when 'nobody' then false
      else true
    end
  );

commit;
