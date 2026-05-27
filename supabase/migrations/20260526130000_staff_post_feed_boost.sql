begin;

-- Boost manual EOD HUB staff posts in the public feed:
--   * soft-pinned near the top for the first 2 hours after posting
--   * ongoing recency boost afterward (treat as ~4 hours younger)
-- RUMINT/news automation is excluded — it keeps its own release cadence.
--
-- Constants mirror app/lib/feedRanking.ts.

create or replace view public.ranked_posts as
select
  id,
  user_id,
  content,
  created_at,
  score,
  ranking_score
from (
  select
    p.id,
    p.user_id,
    p.content,
    p.created_at,
    count(cr.id) as score,
    (
      (1 + count(cr.id))::numeric
      / power(
          (
            case
              when pr.is_pure_admin = true
                and p.user_id <> 'ffffffff-ffff-4fff-afff-52554d494e54'::uuid
                and coalesce(p.content_type, 'user_post') <> 'news'
                and coalesce(p.system_generated, false) = false
              then greatest(
                extract(epoch from now() - p.created_at) / 3600::numeric - 4::numeric,
                0.25::numeric
              )
              else extract(epoch from now() - p.created_at) / 3600::numeric
            end
          ) + 2::numeric,
          1.5
        )
      * case
          when pr.is_pure_admin = true
            and p.user_id <> 'ffffffff-ffff-4fff-afff-52554d494e54'::uuid
            and coalesce(p.content_type, 'user_post') <> 'news'
            and coalesce(p.system_generated, false) = false
            and extract(epoch from now() - p.created_at) / 3600::numeric <= 2::numeric
          then 50::numeric
          when pr.is_pure_admin = true
            and p.user_id <> 'ffffffff-ffff-4fff-afff-52554d494e54'::uuid
            and coalesce(p.content_type, 'user_post') <> 'news'
            and coalesce(p.system_generated, false) = false
          then 2.5::numeric
          else 1::numeric
        end
    ) as ranking_score
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
    pr.is_pure_admin,
    p.content_type,
    p.system_generated
) ranked
order by ranking_score desc, created_at desc;

commit;
