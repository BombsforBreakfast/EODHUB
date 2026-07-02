begin;

-- Optional virtual age (hours) added only for feed ranking. Does not change created_at
-- shown in the UI; lets authors or admins gently sink high-engagement posts.

alter table public.posts
  add column if not exists feed_rank_age_offset_hours numeric not null default 0;

alter table public.posts
  drop constraint if exists posts_feed_rank_age_offset_hours_nonneg;

alter table public.posts
  add constraint posts_feed_rank_age_offset_hours_nonneg
  check (feed_rank_age_offset_hours >= 0);

comment on column public.posts.feed_rank_age_offset_hours is
  'Extra hours added to post age for feed ranking only (created_at display unchanged).';

create or replace view public.ranked_posts as
with ranked as (
  select
    p.id,
    p.user_id,
    p.content,
    p.created_at,
    count(cr.id) as score,
    extract(epoch from now() - p.created_at) / 3600::numeric
      + coalesce(p.feed_rank_age_offset_hours, 0::numeric) as age_hours,
    coalesce(p.content_type, 'user_post') as content_type,
    coalesce(p.system_generated, false) as system_generated,
    pr.is_pure_admin = true as is_staff_author,
    p.user_id = 'ffffffff-ffff-4fff-afff-52554d494e54'::uuid
      or coalesce(p.content_type, 'user_post') = 'news' as is_rumint_post,
    case
      when extract(epoch from now() - p.created_at) / 3600::numeric
        + coalesce(p.feed_rank_age_offset_hours, 0::numeric) < 6 then 3::numeric
      when extract(epoch from now() - p.created_at) / 3600::numeric
        + coalesce(p.feed_rank_age_offset_hours, 0::numeric) < 24 then 2::numeric
      when extract(epoch from now() - p.created_at) / 3600::numeric
        + coalesce(p.feed_rank_age_offset_hours, 0::numeric) < 72 then 1.5::numeric
      when extract(epoch from now() - p.created_at) / 3600::numeric
        + coalesce(p.feed_rank_age_offset_hours, 0::numeric) <= 168 then 1::numeric
      when extract(epoch from now() - p.created_at) / 3600::numeric
        + coalesce(p.feed_rank_age_offset_hours, 0::numeric) < 720 then 0.5::numeric
      else 0.25::numeric
    end as freshness_multiplier
  from public.posts p
  left join public.profiles pr on pr.user_id = p.user_id
  left join public.content_reactions cr
    on cr.subject_kind = 'post'
    and cr.subject_id = p.id
  group by
    p.id,
    p.user_id,
    p.content,
    p.created_at,
    p.content_type,
    p.system_generated,
    p.feed_rank_age_offset_hours,
    pr.is_pure_admin
)
select
  id,
  user_id,
  content,
  created_at,
  score,
  (
    greatest(
      (
        1::numeric
        + least(score::numeric, 50::numeric) * 0.65::numeric
      )
      / power(age_hours + 2::numeric, 0.65::numeric)
      * freshness_multiplier,
      case
        when age_hours < 24 then 1.35::numeric
        when age_hours < 48 then 0.9::numeric
        else 0::numeric
      end
    )
    * case
        when content_type in ('event_publish', 'event_scrapbook') then 1.2::numeric
        when content_type = 'news' then 1.15::numeric
        else 1::numeric
      end
    * case
        when is_staff_author
          and not is_rumint_post
          and content_type <> 'news'
          and system_generated = false
          and age_hours <= 2 then 8::numeric
        when is_staff_author
          and not is_rumint_post
          and content_type <> 'news'
          and system_generated = false then 1.5::numeric
        when is_rumint_post and age_hours <= 3 then 3::numeric
        when is_rumint_post then 1.2::numeric
        else 1::numeric
      end
  ) as ranking_score
from ranked
order by ranking_score desc, created_at desc;

-- Founder personal post: keep visible but sink toward the bottom of the first page.
update public.posts
set feed_rank_age_offset_hours = 600
where content ilike '%emotional support yard birds%'
  and feed_rank_age_offset_hours = 0;

commit;
