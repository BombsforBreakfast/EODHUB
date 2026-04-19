-- RabbitHole topic library extension.
-- The contribute modal exposes an "Other" inline input so curators can add
-- a new category on the fly. To support that, authenticated users can insert
-- into rabbithole_topics, but only as themselves (created_by = auth.uid()).
-- Admins can already do anything via the existing admin policies; founders/
-- moderators can clean up duplicates after the fact.

drop policy if exists rabbithole_topics_insert_authenticated on public.rabbithole_topics;
create policy rabbithole_topics_insert_authenticated
on public.rabbithole_topics
for insert
to authenticated
with check (created_by = auth.uid());

-- User-added topics should sort to the bottom of the picker by default; the
-- frontend writes sort_order = 999 explicitly, but we also enforce a sane
-- floor here so a stray client cannot bump a new topic above the curated set.
drop policy if exists rabbithole_topics_update_own on public.rabbithole_topics;
create policy rabbithole_topics_update_own
on public.rabbithole_topics
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid() and sort_order >= 900);
