-- Fix runtime error in plank_holder_task_status: the OUT parameter named "bio"
-- collided with profiles.bio, causing "column reference \"bio\" is ambiguous"
-- and a 500 from /api/challenges/plank-holder/check-award. Alias the profiles
-- table so the column reads are unambiguous.

create or replace function public.plank_holder_task_status(p_user_id uuid)
returns table (
  profile_photo boolean,
  bio boolean,
  contribution boolean,
  connection boolean,
  invite boolean,
  completed_count integer,
  total integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo boolean := false;
  v_bio boolean := false;
  v_contribution boolean := false;
  v_connection boolean := false;
  v_invite boolean := false;
begin
  select
    coalesce(btrim(pf.photo_url), '') <> '',
    length(btrim(coalesce(pf.bio, ''))) >= 50,
    pf.invite_teammate_completed_at is not null
  into v_photo, v_bio, v_invite
  from public.profiles pf
  where pf.user_id = p_user_id;

  v_photo := coalesce(v_photo, false);
  v_bio := coalesce(v_bio, false);
  v_invite := coalesce(v_invite, false);

  -- Contribution counts a broad set of authoring/engagement actions so users
  -- can complete this objective via any visible contribution surface.
  select exists (
    select 1 from public.posts p where p.user_id = p_user_id
  ) or exists (
    select 1 from public.post_comments c where c.user_id = p_user_id
  ) or exists (
    select 1 from public.content_reactions r where r.user_id = p_user_id
  ) or exists (
    select 1 from public.kangaroo_court_votes v where v.user_id = p_user_id
  ) or exists (
    select 1 from public.event_attendance e where e.user_id = p_user_id
  ) or exists (
    select 1 from public.jobs j where j.user_id = p_user_id
  ) or exists (
    select 1
    from public.business_listings b
    where b.managed_by_user_id = p_user_id
  ) or exists (
    select 1
    from public.resource_comments rc
    where rc.user_id = p_user_id
  )
  into v_contribution;

  -- Beta rule: the first outbound Know action counts so users are not blocked
  -- waiting on another person to respond.
  select exists (
    select 1
    from public.profile_connections pc
    where pc.requester_user_id = p_user_id
      and pc.status in ('pending', 'accepted')
  )
  into v_connection;

  profile_photo := v_photo;
  bio := v_bio;
  contribution := coalesce(v_contribution, false);
  connection := coalesce(v_connection, false);
  invite := v_invite;
  completed_count :=
    (case when profile_photo then 1 else 0 end) +
    (case when bio then 1 else 0 end) +
    (case when contribution then 1 else 0 end) +
    (case when connection then 1 else 0 end) +
    (case when invite then 1 else 0 end);
  total := 5;

  return next;
end;
$$;

revoke all on function public.plank_holder_task_status(uuid) from public, anon, authenticated;
grant execute on function public.plank_holder_task_status(uuid) to service_role;
