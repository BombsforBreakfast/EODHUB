begin;

-- Time-release support for approved news:
-- approvals stay lightweight, while feed appearances are staggered.
alter table public.news_items
  add column if not exists approved_at timestamptz,
  add column if not exists release_at timestamptz;

comment on column public.news_items.approved_at is
  'When an admin approved this item for feed publication.';
comment on column public.news_items.release_at is
  'Scheduled feed-release time for the linked post (used for staggered rollout).';

create index if not exists news_items_status_release_at_idx
  on public.news_items (status, release_at desc);

-- Backfill existing published items so admin screens can show timeline fields.
update public.news_items
set approved_at = coalesce(approved_at, reviewed_at)
where status = 'published'
  and approved_at is null;

-- If a published item already has a linked post, use that post timestamp as
-- the release time.
update public.news_items n
set release_at = coalesce(n.release_at, p.created_at, n.approved_at, n.published_at, n.ingested_at, now())
from public.posts p
where p.news_item_id = n.id
  and n.status = 'published'
  and n.release_at is null;

-- Published rows without linked posts still get a reasonable release marker.
update public.news_items
set release_at = coalesce(release_at, approved_at, published_at, ingested_at, now())
where status = 'published'
  and release_at is null;

-- Non-published items should not carry a scheduled release timestamp.
update public.news_items
set release_at = null
where status <> 'published';

commit;
