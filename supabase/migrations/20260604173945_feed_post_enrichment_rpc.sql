begin;

-- Consolidates repeated feed enrichment reads for a bounded list of post ids.
-- Callers still choose ids via existing ranked-post / wall / visibility logic.
create or replace function public.get_feed_post_enrichment(
  p_post_ids uuid[]
)
returns table (
  post_id uuid,
  image_url text,
  gif_url text,
  og_url text,
  og_title text,
  og_description text,
  og_image text,
  og_site_name text,
  event_id uuid,
  content_type text,
  system_generated boolean,
  news_item_id uuid,
  admin_manual_image_url text,
  court_verdict_at timestamptz,
  rabbithole_thread_id uuid,
  rabbithole_contribution_id uuid,
  image_urls text[],
  post_reactions jsonb,
  comments jsonb,
  comment_reactions jsonb,
  profiles jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested as (
    select post_id, ordinality
    from unnest(p_post_ids) with ordinality as input(post_id, ordinality)
  ),
  target_posts as (
    select p.*, r.ordinality
    from requested r
    join public.posts p on p.id = r.post_id
  ),
  visible_comments as (
    select c.*
    from public.post_comments c
    join target_posts p on p.id = c.post_id
    where coalesce(c.hidden_for_review, false) = false
  ),
  relevant_profile_ids as (
    select p.id as post_id, p.user_id
    from target_posts p

    union

    select p.id as post_id, p.post_as_user_id
    from target_posts p
    where p.post_as_user_id is not null

    union

    select c.post_id, c.user_id
    from visible_comments c

    union

    select cr.subject_id as post_id, cr.user_id
    from public.content_reactions cr
    join target_posts p on p.id = cr.subject_id
    where cr.subject_kind = 'post'

    union

    select c.post_id, cr.user_id
    from public.content_reactions cr
    join visible_comments c on c.id = cr.subject_id
    where cr.subject_kind = 'post_comment'
  )
  select
    p.id as post_id,
    p.image_url,
    p.gif_url,
    p.og_url,
    p.og_title,
    p.og_description,
    p.og_image,
    p.og_site_name,
    p.event_id,
    p.content_type,
    p.system_generated,
    p.news_item_id,
    ni.admin_manual_image_url,
    p.court_verdict_at,
    p.rabbithole_thread_id,
    p.rabbithole_contribution_id,
    coalesce(
      (
        select array_agg(pi.image_url order by pi.sort_order nulls last, pi.created_at)
        from public.post_images pi
        where pi.post_id = p.id
      ),
      array[]::text[]
    ) as image_urls,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'subject_id', cr.subject_id,
            'user_id', cr.user_id,
            'reaction_type', cr.reaction_type
          )
          order by cr.created_at
        )
        from public.content_reactions cr
        where cr.subject_kind = 'post'
          and cr.subject_id = p.id
      ),
      '[]'::jsonb
    ) as post_reactions,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'post_id', c.post_id,
            'user_id', c.user_id,
            'content', c.content,
            'created_at', c.created_at,
            'image_url', c.image_url,
            'gif_url', c.gif_url,
            'parent_comment_id', c.parent_comment_id
          )
          order by c.created_at
        )
        from visible_comments c
        where c.post_id = p.id
      ),
      '[]'::jsonb
    ) as comments,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'subject_id', cr.subject_id,
            'user_id', cr.user_id,
            'reaction_type', cr.reaction_type
          )
          order by cr.created_at
        )
        from public.content_reactions cr
        join visible_comments c on c.id = cr.subject_id
        where cr.subject_kind = 'post_comment'
          and c.post_id = p.id
      ),
      '[]'::jsonb
    ) as comment_reactions,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', pr.user_id,
            'display_name', pr.display_name,
            'first_name', pr.first_name,
            'last_name', pr.last_name,
            'photo_url', pr.photo_url,
            'service', pr.service,
            'is_employer', pr.is_employer,
            'is_pure_admin', pr.is_pure_admin,
            'email', pr.email
          )
          order by pr.display_name nulls last, pr.first_name nulls last, pr.last_name nulls last
        )
        from public.profiles pr
        where pr.user_id in (
          select rpi.user_id
          from relevant_profile_ids rpi
          where rpi.post_id = p.id
        )
      ),
      '[]'::jsonb
    ) as profiles
  from target_posts p
  left join public.news_items ni on ni.id = p.news_item_id
  order by p.ordinality;
$$;

revoke all on function public.get_feed_post_enrichment(uuid[]) from public;
grant execute on function public.get_feed_post_enrichment(uuid[]) to authenticated;

commit;
