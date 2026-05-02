begin;

-- Polymorphic reactions (posts first; extend subject_kind later for comments/DMs/etc.)

create table public.content_reactions (
  id uuid primary key default gen_random_uuid(),
  subject_kind text not null,
  subject_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_reactions_subject_kind_check check (
    subject_kind in ('post')
  ),
  constraint content_reactions_reaction_type_check check (
    reaction_type in (
      'like',
      'dislike',
      'strong',
      'fire',
      'bomb',
      'whiskey',
      'smoke',
      'laugh',
      'sad',
      'respect'
    )
  ),
  constraint content_reactions_subject_user_unique unique (subject_kind, subject_id, user_id)
);

create index content_reactions_subject_kind_subject_id_idx
  on public.content_reactions (subject_kind, subject_id);

create index content_reactions_user_id_idx on public.content_reactions (user_id);

comment on table public.content_reactions is
  'Fast reactions on feed entities; subject_kind scopes subject_id (e.g. post -> public.posts.id).';

create or replace function public.content_reactions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists content_reactions_touch_updated_at on public.content_reactions;
create trigger content_reactions_touch_updated_at
  before update on public.content_reactions
  for each row execute function public.content_reactions_touch_updated_at();

alter table public.content_reactions enable row level security;

create policy content_reactions_select_authenticated
  on public.content_reactions for select to authenticated using (true);

create policy content_reactions_insert_own
  on public.content_reactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy content_reactions_update_own
  on public.content_reactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy content_reactions_delete_own
  on public.content_reactions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Backfill legacy likes into reactions (subject_kind post -> posts.id)
insert into public.content_reactions (subject_kind, subject_id, user_id, reaction_type, created_at, updated_at)
select 'post'::text, pl.post_id, pl.user_id, 'like'::text, now(), now()
from public.post_likes pl
on conflict (subject_kind, subject_id, user_id) do nothing;

-- Ranking uses reactions instead of raw post_likes count
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
    (1 + count(cr.id))::numeric
      / power(
          extract(epoch from now() - p.created_at) / 3600::numeric + 2::numeric,
          1.5
        ) as ranking_score
  from public.posts p
  left join public.content_reactions cr
    on cr.subject_kind = 'post'
    and cr.subject_id = p.id
  group by p.id, p.user_id, p.content, p.created_at
) ranked
order by ranking_score desc, created_at desc;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'content_reactions'
  ) then
    alter publication supabase_realtime add table public.content_reactions;
  end if;
end $$;

commit;
