create table public.listing_service_ratings (
visitor_id uuid primary key,
score numeric(2,1) not null check (score between 0.5 and 5 and score * 2 = trunc(score * 2)),
display_name text not null default '' check (char_length(display_name) <= 60),
testimonial text not null default '' check (char_length(testimonial) <= 1200),
updated_at timestamptz not null default now()
);
alter table public.listing_service_ratings enable row level security;
revoke all on public.listing_service_ratings from anon, authenticated;
grant select, insert, update, delete on public.listing_service_ratings to service_role;
create function public.listing_service_rating_summary()
returns table(average numeric, rating_count bigint)
language sql stable security invoker set search_path = ''
as $$ select avg(score), count(*) from public.listing_service_ratings $$;
revoke all on function public.listing_service_rating_summary() from public, anon, authenticated;
grant execute on function public.listing_service_rating_summary() to service_role;