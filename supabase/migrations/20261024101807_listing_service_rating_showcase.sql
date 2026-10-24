alter table public.listing_service_ratings add column review_id uuid not null default gen_random_uuid(), add column is_pinned boolean not null default false, add column created_at timestamptz not null default now();
update public.listing_service_ratings set created_at = updated_at;
alter table public.listing_service_ratings add constraint listing_service_ratings_review_id_key unique(review_id);
create index listing_service_ratings_featured_idx on public.listing_service_ratings(is_pinned desc,score desc,created_at desc,review_id);
create index listing_service_ratings_newest_idx on public.listing_service_ratings(created_at desc,review_id);
create function public.listing_service_rating_overview()
returns table(average numeric, rating_count bigint, distribution jsonb)
language sql stable security invoker set search_path = ''
as $$ select avg(score),count(*),
(select coalesce(jsonb_agg(jsonb_build_object('bombs',bombs,'count',n) order by bombs desc),'[]'::jsonb) from (select ceil(score)::int as bombs,count(*) as n from public.listing_service_ratings group by ceil(score)) buckets)
from public.listing_service_ratings $$;
revoke all on function public.listing_service_rating_overview() from public, anon, authenticated;
grant execute on function public.listing_service_rating_overview() to service_role;