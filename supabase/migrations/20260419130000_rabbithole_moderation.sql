-- RabbitHole moderation primitives.
-- Adds:
--   * hidden_for_review boolean on contributions and contribution comments
--     (matches existing posts/post_comments/messages moderation pattern)
--   * Author DELETE policy for rabbithole_contributions (other tables already
--     allow own-delete; threads/replies already do)
--   * Admin "all-actions" RLS policies for moderation/QA on every RabbitHole
--     content table, gated on profiles.is_admin
--   * SELECT policies updated so hidden rows stay visible to the author and to
--     admins, but disappear from the public surface
--   * flags.content_type whitelist refreshed to include rabbithole_* values
--     so any user can flag RabbitHole content via the existing flag pipeline

alter table public.rabbithole_contributions
  add column if not exists hidden_for_review boolean not null default false;

alter table public.rabbithole_contribution_comments
  add column if not exists hidden_for_review boolean not null default false;

create index if not exists rabbithole_contributions_hidden_idx
  on public.rabbithole_contributions (hidden_for_review)
  where hidden_for_review = true;

create index if not exists rabbithole_contribution_comments_hidden_idx
  on public.rabbithole_contribution_comments (hidden_for_review)
  where hidden_for_review = true;

-- Author can delete their own contribution.
drop policy if exists rabbithole_contributions_delete_own on public.rabbithole_contributions;
create policy rabbithole_contributions_delete_own
on public.rabbithole_contributions
for delete
to authenticated
using (created_by = auth.uid());

-- Admin override: full access on every RabbitHole content table for moderation/QA.
-- Uses profiles.is_admin (consistent with the rest of the app's admin gating).
drop policy if exists rabbithole_contributions_admin_all on public.rabbithole_contributions;
create policy rabbithole_contributions_admin_all
on public.rabbithole_contributions
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_contribution_comments_admin_all on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_admin_all
on public.rabbithole_contribution_comments
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_contribution_tags_admin_all on public.rabbithole_contribution_tags;
create policy rabbithole_contribution_tags_admin_all
on public.rabbithole_contribution_tags
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_contribution_likes_admin_all on public.rabbithole_contribution_likes;
create policy rabbithole_contribution_likes_admin_all
on public.rabbithole_contribution_likes
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_assets_admin_all on public.rabbithole_assets;
create policy rabbithole_assets_admin_all
on public.rabbithole_assets
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_threads_admin_all on public.rabbithole_threads;
create policy rabbithole_threads_admin_all
on public.rabbithole_threads
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_replies_admin_all on public.rabbithole_replies;
create policy rabbithole_replies_admin_all
on public.rabbithole_replies
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
)
with check (
  exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

-- Tighten read policies to filter hidden_for_review rows from non-owners/non-admins.
drop policy if exists rabbithole_contributions_select_authenticated on public.rabbithole_contributions;
create policy rabbithole_contributions_select_authenticated
on public.rabbithole_contributions
for select
to authenticated
using (
  (status = 'active' and hidden_for_review = false)
  or created_by = auth.uid()
  or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

drop policy if exists rabbithole_contribution_comments_select_authenticated on public.rabbithole_contribution_comments;
create policy rabbithole_contribution_comments_select_authenticated
on public.rabbithole_contribution_comments
for select
to authenticated
using (
  (deleted_at is null and hidden_for_review = false)
  or user_id = auth.uid()
  or exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.is_admin = true)
);

-- Refresh the flags.content_type whitelist to include rabbithole_* types so any
-- authenticated user can submit flags through the existing /api/flag-content
-- pipeline. The constraint name in older bootstraps is unknown, so drop any
-- existing CHECK constraint that mentions content_type before re-adding.
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.flags'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%content_type%'
  loop
    execute format('alter table public.flags drop constraint %I', cname);
  end loop;
end$$;

alter table public.flags add constraint flags_content_type_check check (
  content_type in (
    'post',
    'comment',
    'message',
    'rabbithole_contribution',
    'rabbithole_contribution_comment',
    'rabbithole_thread',
    'rabbithole_reply'
  )
);
