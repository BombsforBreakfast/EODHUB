begin;

-- Rework public.ranked_posts so brand-new posts (0 likes) still surface above
-- older zero-engagement posts, and time-released RUMINT news articles have a
-- real chance to appear near the top of the feed instead of sinking to the
-- bottom.
--
-- Previous scoring: likes / (age_hours + 2)^1.5
--   -> every zero-like post = 0, so recency was effectively ignored for new
--      content; old posts with even 1 like always beat fresh content.
--
-- New scoring: (1 + likes) / (age_hours + 2)^1.5
--   -> every post gets a recency-decayed baseline, engagement still amplifies
--      older posts, but freshly released items surface immediately.
--
-- Secondary ORDER BY created_at DESC is a deterministic tiebreaker so posts
-- released in the same batch keep the intended chronological order.

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
    count(l.id) as score,
    (1 + count(l.id))::numeric
      / power(
          extract(epoch from now() - p.created_at) / 3600::numeric + 2::numeric,
          1.5
        ) as ranking_score
  from public.posts p
  left join public.post_likes l on l.post_id = p.id
  group by p.id, p.user_id, p.content, p.created_at
) ranked
order by ranking_score desc, created_at desc;

commit;
