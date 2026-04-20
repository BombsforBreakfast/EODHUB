begin;

-- Backfill legacy event feed posts that were created without posts.event_id.
-- Target shape from app/events/page.tsx:
--   line 1: "📅 New Event: <title>"
--   line 2: "📆 <formatted date>"
--   later : "Sign up: <url>" (optional)
--
-- Strategy:
-- 1) Match by normalized title + same author (user_id), pick closest event date.
-- 2) Fallback: match by signup_url + same author when title parsing misses.

with candidate_posts as (
  select
    p.id as post_id,
    p.user_id,
    p.created_at,
    trim(
      regexp_replace(
        p.content,
        E'^📅\\s*New Event:\\s*([^\\n\\r]+).*$',
        E'\\1',
        's'
      )
    ) as extracted_title
  from public.posts p
  where p.event_id is null
    and p.content like '📅 New Event:%'
),
best_event_match as (
  select
    cp.post_id,
    e.id as event_id,
    row_number() over (
      partition by cp.post_id
      order by
        abs(extract(epoch from (cp.created_at - coalesce(e.created_at, cp.created_at)))) asc,
        abs(extract(epoch from ((cp.created_at)::date - e.date))) asc,
        e.id
    ) as rn
  from candidate_posts cp
  join public.events e
    on e.user_id = cp.user_id
   and lower(trim(e.title)) = lower(cp.extracted_title)
)
update public.posts p
set event_id = bem.event_id
from best_event_match bem
where p.id = bem.post_id
  and bem.rn = 1
  and p.event_id is null;

-- Fallback pass: parse "Sign up: <url>" and match against events.signup_url.
with candidate_posts as (
  select
    p.id as post_id,
    p.user_id,
    p.created_at,
    nullif(
      trim(
        regexp_replace(
          p.content,
          E'^.*Sign up:\\s*([^\\n\\r]+).*$',
          E'\\1',
          's'
        )
      ),
      ''
    ) as extracted_signup_url
  from public.posts p
  where p.event_id is null
    and p.content like '📅 New Event:%'
    and p.content ilike '%Sign up:%'
),
best_event_match as (
  select
    cp.post_id,
    e.id as event_id,
    row_number() over (
      partition by cp.post_id
      order by
        abs(extract(epoch from (cp.created_at - coalesce(e.created_at, cp.created_at)))) asc,
        e.id
    ) as rn
  from candidate_posts cp
  join public.events e
    on e.user_id = cp.user_id
   and coalesce(e.signup_url, '') <> ''
   and lower(trim(e.signup_url)) = lower(cp.extracted_signup_url)
)
update public.posts p
set event_id = bem.event_id
from best_event_match bem
where p.id = bem.post_id
  and bem.rn = 1
  and p.event_id is null;

commit;
