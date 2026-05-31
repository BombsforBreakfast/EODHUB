-- Self-service account deletion: audit log, ghost profiles, content-preserving FKs.

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_created_idx
  on public.account_deletion_requests (created_at desc);

create index if not exists account_deletion_requests_user_id_idx
  on public.account_deletion_requests (user_id);

alter table public.account_deletion_requests enable row level security;

comment on table public.account_deletion_requests is
  'Audit log when members self-delete. Inserts via service role only.';

alter table public.profiles
  add column if not exists account_deleted_at timestamptz;

create index if not exists profiles_account_deleted_at_idx
  on public.profiles (account_deleted_at)
  where account_deleted_at is not null;

-- Ghost profiles survive auth.users deletion so posts/jobs/listings keep attribution.
alter table public.profiles drop constraint if exists profiles_user_id_fkey;

-- Repoint content FKs from auth.users → profiles (auth delete no longer cascades content).
alter table public.post_comments drop constraint if exists post_comments_user_id_fkey;
alter table public.post_comments
  add constraint post_comments_user_id_fkey
  foreign key (user_id) references public.profiles (user_id) on delete restrict;

alter table public.jobs drop constraint if exists jobs_user_id_fkey;
alter table public.jobs
  add constraint jobs_user_id_fkey
  foreign key (user_id) references public.profiles (user_id) on delete set null;

alter table public.business_listings drop constraint if exists business_listings_owner_user_id_fkey;
alter table public.business_listings
  add constraint business_listings_owner_user_id_fkey
  foreign key (owner_user_id) references public.profiles (user_id) on delete set null;

alter table public.business_listings drop constraint if exists business_listings_managed_by_user_id_fkey;
alter table public.business_listings
  add constraint business_listings_managed_by_user_id_fkey
  foreign key (managed_by_user_id) references public.profiles (user_id) on delete set null;

-- Weekly analytics: exclude closed accounts from member metrics; track deletions.
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
  )
  select jsonb_build_object(
    'window_start', p_since,
    'window_end', p_until,
    'this_week', jsonb_build_object(
      'new_users', (
        select count(*) from members m
        where m.created_at >= p_since and m.created_at < p_until
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
      'new_community_jobs', (
        select count(*) from public.jobs j
        where j.source_type = 'community'
          and j.created_at >= p_since
          and j.created_at < p_until
      ),
      'new_resources', (
        select count(*) from public.business_listings b
        where b.listing_type = 'resource'
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
