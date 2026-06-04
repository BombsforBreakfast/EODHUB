-- When a business/org page owner dismisses an erroneous directory link suggestion,
-- hide that match for them permanently.

begin;

create table if not exists public.business_listing_link_suggestion_dismissals (
  user_id uuid not null references auth.users (id) on delete cascade,
  business_listing_id uuid not null references public.business_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_listing_id)
);

create index if not exists business_listing_link_suggestion_dismissals_listing_idx
  on public.business_listing_link_suggestion_dismissals (business_listing_id);

comment on table public.business_listing_link_suggestion_dismissals is
  'Owners who dismissed a suggested business-listing link match — hidden only for that user.';

alter table public.business_listing_link_suggestion_dismissals enable row level security;

drop policy if exists business_listing_link_suggestion_dismissals_select_own
  on public.business_listing_link_suggestion_dismissals;
create policy business_listing_link_suggestion_dismissals_select_own
  on public.business_listing_link_suggestion_dismissals
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists business_listing_link_suggestion_dismissals_insert_own
  on public.business_listing_link_suggestion_dismissals;
create policy business_listing_link_suggestion_dismissals_insert_own
  on public.business_listing_link_suggestion_dismissals
  for insert
  to authenticated
  with check (user_id = auth.uid());

commit;
