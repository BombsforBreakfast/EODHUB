-- Post author can foreclose Kangaroo Court: end voting, cancel active court, and block any future KC on this post.
-- Deleting the post still cascades to kangaroo_courts (on delete cascade on feed_post_id).

begin;

alter table public.posts
  add column if not exists kangaroo_court_foreclosed boolean not null default false;

create index if not exists idx_posts_kangaroo_court_foreclosed
  on public.posts (id)
  where kangaroo_court_foreclosed = true;

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
      and coalesce(p.kangaroo_court_foreclosed, false) = false
  );
$$;

-- Post owner only: set foreclosed; cancel any active feed court on this post.
create or replace function public.foreclose_kangaroo_court_on_feed_post(p_feed_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner from public.posts where id = p_feed_post_id for update;
  if not found then
    raise exception 'Post not found';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'Only the post author can do this';
  end if;

  update public.posts
  set kangaroo_court_foreclosed = true
  where id = p_feed_post_id;

  update public.kangaroo_courts
  set status = 'cancelled',
      closed_at = coalesce(closed_at, now())
  where feed_post_id = p_feed_post_id
    and status = 'active';
end;
$$;

revoke all on function public.foreclose_kangaroo_court_on_feed_post(uuid) from public;
grant execute on function public.foreclose_kangaroo_court_on_feed_post(uuid) to authenticated;

commit;
