-- News -> posts architecture (course-corrected)
--
-- Keep news_items as article metadata + moderation queue.
-- Published news gets a linked row in posts (social object) so feed parity
-- comes for free: likes, comments, GIFs/emojis, Rabbithole, Kangaroo Court,
-- and future notifications.

begin;

-- 1) RUMINT system identity

-- Fixed UUID so all environments converge on one system actor.
-- "52554d494e54" is ASCII hex for "RUMINT".
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  'ffffffff-ffff-4fff-afff-52554d494e54',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'rumint@system.eod-hub.invalid',
  crypt(gen_random_bytes(32)::text, gen_salt('bf')),
  now(),
  jsonb_build_object('provider', 'system', 'providers', jsonb_build_array('system')),
  jsonb_build_object('display_name', 'RUMINT', 'system', true),
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.profiles (
  user_id,
  display_name,
  first_name,
  last_name,
  role,
  account_type,
  verification_status,
  is_approved,
  privacy_discoverable,
  privacy_show_online
)
values (
  'ffffffff-ffff-4fff-afff-52554d494e54',
  'RUMINT',
  'RUMINT',
  null,
  'Newswire',
  'member',
  'verified',
  true,
  false,
  false
)
on conflict (user_id) do update set
  display_name = excluded.display_name,
  first_name = excluded.first_name,
  role = excluded.role,
  verification_status = excluded.verification_status,
  is_approved = excluded.is_approved,
  privacy_discoverable = excluded.privacy_discoverable,
  privacy_show_online = excluded.privacy_show_online;

-- 2) posts classification + linkage

alter table public.posts
  add column if not exists content_type text;

update public.posts
set content_type = 'user_post'
where content_type is null;

alter table public.posts
  alter column content_type set default 'user_post';

alter table public.posts
  alter column content_type set not null;

alter table public.posts
  add column if not exists system_generated boolean;

update public.posts
set system_generated = false
where system_generated is null;

alter table public.posts
  alter column system_generated set default false;

alter table public.posts
  alter column system_generated set not null;

alter table public.news_items
  add column if not exists shadow_post_id uuid references public.posts (id) on delete set null;

create unique index if not exists news_items_shadow_post_id_uniq
  on public.news_items (shadow_post_id)
  where shadow_post_id is not null;

alter table public.posts
  add column if not exists news_item_id uuid references public.news_items (id) on delete cascade;

create unique index if not exists posts_news_item_id_uniq
  on public.posts (news_item_id)
  where news_item_id is not null;

comment on column public.news_items.shadow_post_id is
  'The feed-visible public.posts row backing this news item (if published).';
comment on column public.posts.news_item_id is
  'When set, this post is a shadow post backing a news item (author = RUMINT).';

-- 3) One-time backfill for already-published items.
--    Ongoing publish/reject sync is handled in app/api/admin/news/route.ts.

insert into public.posts (
  user_id,
  content,
  og_url,
  og_title,
  og_description,
  og_image,
  og_site_name,
  news_item_id,
  content_type,
  system_generated,
  created_at
)
select
  'ffffffff-ffff-4fff-afff-52554d494e54'::uuid as user_id,
  case
    when n.summary is not null and length(trim(n.summary)) > 0
      then n.headline || E'\n\n' || n.summary
    else n.headline
  end as content,
  coalesce(n.canonical_url, n.source_url) as og_url,
  n.headline as og_title,
  n.summary as og_description,
  n.thumbnail_url as og_image,
  n.source_name as og_site_name,
  n.id as news_item_id,
  'news' as content_type,
  true as system_generated,
  coalesce(n.published_at, n.ingested_at, now()) as created_at
from public.news_items n
left join public.posts p on p.news_item_id = n.id
where n.status = 'published'
  and p.id is null;

update public.news_items n
set shadow_post_id = p.id
from public.posts p
where p.news_item_id = n.id
  and n.status = 'published'
  and n.shadow_post_id is distinct from p.id;

update public.news_items
set shadow_post_id = null
where status <> 'published';

-- 4) Rabbithole source URL carry-through.
--
-- When a post with an og_url (either a user-shared link or a RUMINT news
-- shadow post) is promoted to a Rabbithole thread, we want the thread to
-- know the source URL explicitly — not just implicitly via the promoted
-- post. rabbithole_contributions already has these fields; mirror them on
-- rabbithole_threads.

alter table public.rabbithole_threads
  add column if not exists source_url text,
  add column if not exists source_domain text;

create index if not exists rabbithole_threads_source_domain_idx
  on public.rabbithole_threads (source_domain)
  where source_domain is not null;

commit;
