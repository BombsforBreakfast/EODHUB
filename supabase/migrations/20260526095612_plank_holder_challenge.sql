begin;

alter table public.profiles
  add column if not exists plank_holder_awarded boolean not null default false,
  add column if not exists plank_holder_number integer,
  add column if not exists plank_holder_awarded_at timestamptz,
  add column if not exists plank_holder_seen_modal boolean not null default false,
  add column if not exists invite_teammate_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_plank_holder_number_range;

alter table public.profiles
  add constraint profiles_plank_holder_number_range
  check (
    plank_holder_number is null
    or plank_holder_number between 1 and 50
  );

create unique index if not exists profiles_plank_holder_number_unique_idx
  on public.profiles (plank_holder_number)
  where plank_holder_number is not null;

create index if not exists profiles_plank_holder_awarded_idx
  on public.profiles (plank_holder_awarded, plank_holder_awarded_at)
  where plank_holder_awarded = true;

comment on column public.profiles.plank_holder_awarded is
  'Permanent Plank Holder Challenge award flag. First 50 eligible members only.';
comment on column public.profiles.plank_holder_number is
  'Permanent Plank Holder number, allocated from the smallest unused value 1-50.';
comment on column public.profiles.invite_teammate_completed_at is
  'Timestamp when the member completed the invite objective by triggering an invite action.';

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
  v_referral_code text;
begin
  select
    coalesce(btrim(pf.photo_url), '') <> '',
    length(btrim(coalesce(pf.bio, ''))) >= 50,
    pf.invite_teammate_completed_at is not null,
    pf.referral_code
  into v_photo, v_bio, v_invite, v_referral_code
  from public.profiles pf
  where pf.user_id = p_user_id;

  v_photo := coalesce(v_photo, false);
  v_bio := coalesce(v_bio, false);
  v_invite := coalesce(v_invite, false);

  -- Backfill: any user who already had someone sign up with their referral
  -- code clearly invited a teammate, even before the challenge launched.
  if not v_invite and v_referral_code is not null and btrim(v_referral_code) <> '' then
    if exists (
      select 1
      from public.profiles other
      where other.referred_by = v_referral_code
        and other.user_id <> p_user_id
    ) then
      v_invite := true;
    end if;
  end if;

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

create or replace function public.award_plank_holder_if_eligible(p_user_id uuid)
returns table (
  awarded boolean,
  plank_holder_number integer,
  remaining_spots integer,
  already_closed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_number integer;
  v_claimed integer := 0;
  v_next_number integer;
  v_status record;
begin
  select p.plank_holder_number
  into v_existing_number
  from public.profiles p
  where p.user_id = p_user_id
    and p.plank_holder_awarded = true;

  if v_existing_number is not null then
    select count(*)::integer
    into v_claimed
    from public.profiles p
    where p.plank_holder_awarded = true;

    awarded := true;
    plank_holder_number := v_existing_number;
    remaining_spots := greatest(50 - v_claimed, 0);
    already_closed := false;
    return next;
    return;
  end if;

  select *
  into v_status
  from public.plank_holder_task_status(p_user_id);

  if not (
    coalesce(v_status.profile_photo, false)
    and coalesce(v_status.bio, false)
    and coalesce(v_status.contribution, false)
    and coalesce(v_status.connection, false)
    and coalesce(v_status.invite, false)
  ) then
    select count(*)::integer
    into v_claimed
    from public.profiles p
    where p.plank_holder_awarded = true;

    awarded := false;
    plank_holder_number := null;
    remaining_spots := greatest(50 - v_claimed, 0);
    already_closed := v_claimed >= 50;
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('plank_holder_award'));

  select p.plank_holder_number
  into v_existing_number
  from public.profiles p
  where p.user_id = p_user_id
    and p.plank_holder_awarded = true;

  if v_existing_number is not null then
    select count(*)::integer
    into v_claimed
    from public.profiles p
    where p.plank_holder_awarded = true;

    awarded := true;
    plank_holder_number := v_existing_number;
    remaining_spots := greatest(50 - v_claimed, 0);
    already_closed := false;
    return next;
    return;
  end if;

  select count(*)::integer
  into v_claimed
  from public.profiles p
  where p.plank_holder_awarded = true;

  if v_claimed >= 50 then
    awarded := false;
    plank_holder_number := null;
    remaining_spots := 0;
    already_closed := true;
    return next;
    return;
  end if;

  select s.n
  into v_next_number
  from generate_series(1, 50) as s(n)
  where not exists (
    select 1
    from public.profiles p
    where p.plank_holder_number = s.n
  )
  order by s.n
  limit 1;

  if v_next_number is null then
    awarded := false;
    plank_holder_number := null;
    remaining_spots := 0;
    already_closed := true;
    return next;
    return;
  end if;

  update public.profiles p
  set
    plank_holder_awarded = true,
    plank_holder_number = v_next_number,
    plank_holder_awarded_at = now()
  where p.user_id = p_user_id
    and p.plank_holder_awarded = false;

  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    select p.plank_holder_number
    into v_existing_number
    from public.profiles p
    where p.user_id = p_user_id
      and p.plank_holder_awarded = true;

    awarded := v_existing_number is not null;
    plank_holder_number := v_existing_number;
  else
    awarded := true;
    plank_holder_number := v_next_number;
  end if;

  select count(*)::integer
  into v_claimed
  from public.profiles p
  where p.plank_holder_awarded = true;

  remaining_spots := greatest(50 - v_claimed, 0);
  already_closed := v_claimed >= 50 and not awarded;
  return next;
end;
$$;

revoke all on function public.award_plank_holder_if_eligible(uuid) from public, anon, authenticated;
grant execute on function public.award_plank_holder_if_eligible(uuid) to service_role;

create or replace function public.guard_plank_holder_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.plank_holder_awarded is distinct from old.plank_holder_awarded then
    raise exception 'plank_holder_awarded can only be changed server-side';
  end if;

  if new.plank_holder_number is distinct from old.plank_holder_number then
    raise exception 'plank_holder_number can only be changed server-side';
  end if;

  if new.plank_holder_awarded_at is distinct from old.plank_holder_awarded_at then
    raise exception 'plank_holder_awarded_at can only be changed server-side';
  end if;

  if new.invite_teammate_completed_at is distinct from old.invite_teammate_completed_at then
    raise exception 'invite_teammate_completed_at can only be changed server-side';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_plank_holder_profile_fields on public.profiles;
create trigger trg_guard_plank_holder_profile_fields
  before update on public.profiles
  for each row execute function public.guard_plank_holder_profile_fields();

commit;
