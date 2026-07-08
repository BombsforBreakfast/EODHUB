-- Extend weekly analytics snapshot with user-facing rollup fields.

create or replace function public.weekly_analytics_snapshot(
  p_since timestamptz,
  p_until timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  with excluded as (
    select p.user_id
    from public.profiles p
    where coalesce(p.is_pure_admin, false) = true
       or lower(coalesce(p.email, '')) = 'hello@eod-hub.com'
       or p.user_id = 'a28ddac8-dc3a-4ae1-83f5-b675e7b85871'::uuid
  ),
  members as (
    select p.*
    from public.profiles p
    where p.user_id not in (select user_id from excluded)
      and p.account_deleted_at is null
  ),
  member_auth as (
    select u.id as user_id, u.last_sign_in_at, u.created_at as auth_created_at
    from auth.users u
    where u.deleted_at is null
      and u.id not in (select user_id from excluded)
  ),
  recent_members as (
    select
      m.user_id,
      m.created_at,
      coalesce(
        nullif(btrim(concat_ws(' ', m.first_name, m.last_name)), ''),
        nullif(btrim(coalesce(m.display_name, '')), ''),
        nullif(btrim(coalesce(m.email, '')), ''),
        'New member'
      ) as member_name
    from members m
    where m.created_at >= p_since
      and m.created_at < p_until
  )
  select jsonb_build_object(
    'window_start', p_since,
    'window_end', p_until,
    'this_week', jsonb_build_object(
      'new_users', (
        select count(*) from recent_members
      ),
      'new_members', (
        select count(*) from recent_members
      ),
      'new_member_names', (
        select coalesce(jsonb_agg(rm.member_name order by rm.created_at desc), '[]'::jsonb)
        from recent_members rm
      ),
      'new_verified', (
        select count(*) from members m
        where coalesce(m.admin_verified, false) = true
          and m.admin_approved_at is not null
          and m.admin_approved_at >= p_since
          and m.admin_approved_at < p_until
      ),
      'deleted_accounts', (
        select count(*) from public.account_deletion_requests d
        where d.created_at >= p_since and d.created_at < p_until
      ),
      'new_jobs', (
        select count(*) from public.jobs j
        where coalesce(j.is_approved, false) = true
          and coalesce(j.is_rejected, false) = false
          and j.created_at >= p_since
          and j.created_at < p_until
      ),
      'new_community_jobs', (
        select count(*) from public.jobs j
        where j.source_type = 'community'
          and j.created_at >= p_since
          and j.created_at < p_until
      ),
      'new_resources', (
        select count(*) from public.business_listings b
        where b.listing_type = 'resource'
          and coalesce(b.is_approved, false) = true
          and b.created_at >= p_since
          and b.created_at < p_until
      ),
      'new_business_listings', (
        select count(*) from public.business_listings b
        where b.listing_type in ('business', 'organization')
          and coalesce(b.is_approved, false) = true
          and b.created_at >= p_since
          and b.created_at < p_until
      ),
      'new_posts', (
        select count(*) from public.posts p
        where coalesce(p.system_generated, false) = false
          and p.created_at >= p_since
          and p.created_at < p_until
      ),
      'new_recruits', (
        select count(*) from members m
        where m.referred_by is not null
          and btrim(m.referred_by) <> ''
          and m.created_at >= p_since
          and m.created_at < p_until
      ),
      'new_plank_holders', (
        select count(*) from members m
        where m.plank_holder_awarded = true
          and m.plank_holder_awarded_at is not null
          and m.plank_holder_awarded_at >= p_since
          and m.plank_holder_awarded_at < p_until
      )
    ),
    'platform', jsonb_build_object(
      'total_members', (select count(*) from members),
      'total_jobs', (
        select count(*) from public.jobs j
        where coalesce(j.is_approved, false) = true
          and coalesce(j.is_rejected, false) = false
      ),
      'total_resources', (
        select count(*) from public.business_listings b
        where b.listing_type = 'resource'
          and coalesce(b.is_approved, false) = true
      ),
      'total_business_listings', (
        select count(*) from public.business_listings b
        where b.listing_type in ('business', 'organization')
          and coalesce(b.is_approved, false) = true
      ),
      'verified_members', (
        select count(*) from members m
        where m.admin_verified = true or m.verification_status = 'verified'
      ),
      'pending_verification', (
        select count(*) from members m
        where m.verification_status = 'pending'
           or (coalesce(m.admin_verified, false) = false and coalesce(m.email_verified, false) = true)
      ),
      'completed_profiles', (
        select count(*) from members m
        where btrim(coalesce(m.first_name, '')) <> ''
          and btrim(coalesce(m.last_name, '')) <> ''
          and btrim(coalesce(m.photo_url, '')) <> ''
          and btrim(coalesce(m.bio, '')) <> ''
      ),
      'plank_holders', (
        select count(*) from members m where m.plank_holder_awarded = true
      ),
      'recruiters', (
        select count(*) from members referrer
        where referrer.referral_code is not null
          and btrim(referrer.referral_code) <> ''
          and exists (
            select 1 from members recruit
            where recruit.referred_by = referrer.referral_code
              and recruit.user_id <> referrer.user_id
          )
      ),
      'total_deleted_accounts', (
        select count(*) from public.account_deletion_requests
      ),
      'wau', (
        select count(distinct a.user_id)
        from public.analytics_sessions a
        where a.user_id is not null
          and a.user_id not in (select user_id from excluded)
          and a.started_at >= p_since
          and a.started_at < p_until
      ),
      'authenticated_untracked', (
        select count(*)
        from member_auth u
        where u.last_sign_in_at is not null
          and not exists (
            select 1 from public.analytics_sessions a where a.user_id = u.user_id
          )
      )
    ),
    'this_week_engagement', jsonb_build_object(
      'distinct_posters', (
        select count(distinct p.user_id)
        from public.posts p
        where coalesce(p.system_generated, false) = false
          and p.user_id not in (select user_id from excluded)
          and p.created_at >= p_since
          and p.created_at < p_until
      ),
      'distinct_commenters', (
        select count(distinct x.user_id)
        from (
          select c.user_id from public.post_comments c
          where c.created_at >= p_since and c.created_at < p_until
          union
          select rc.user_id from public.resource_comments rc
          where rc.created_at >= p_since and rc.created_at < p_until
        ) x
        where x.user_id not in (select user_id from excluded)
      ),
      'active_users', (
        select count(distinct a.user_id)
        from public.analytics_sessions a
        where a.user_id is not null
          and a.user_id not in (select user_id from excluded)
          and a.started_at >= p_since
          and a.started_at < p_until
      )
    ),
    'demographics', jsonb_build_object(
      'active_duty', (select count(*) from members m where m.status = 'Active Duty'),
      'retired', (select count(*) from members m where m.status = 'Retired'),
      'former', (select count(*) from members m where m.status = 'Former'),
      'army', (select count(*) from members m where m.service = 'Army'),
      'marines', (select count(*) from members m where m.service = 'Marines'),
      'air_force', (select count(*) from members m where m.service = 'Air Force'),
      'navy', (select count(*) from members m where m.service = 'Navy'),
      'civilian_bomb_tech', (select count(*) from members m where m.service = 'Civilian Bomb Tech')
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.weekly_analytics_snapshot(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.weekly_analytics_snapshot(timestamptz, timestamptz) to service_role;
