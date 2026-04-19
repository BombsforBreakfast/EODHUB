-- RabbitHole storage bucket and object policies
-- Keeps file bytes private by default while allowing authenticated repository access.

insert into storage.buckets (id, name, public)
values ('rabbithole-assets', 'rabbithole-assets', false)
on conflict (id) do nothing;

drop policy if exists rabbithole_assets_read_authenticated on storage.objects;
create policy rabbithole_assets_read_authenticated
on storage.objects
for select
to authenticated
using (bucket_id = 'rabbithole-assets');

drop policy if exists rabbithole_assets_insert_own_folder on storage.objects;
create policy rabbithole_assets_insert_own_folder
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rabbithole-assets'
  and split_part(name, '/', 3) = auth.uid()::text
);

drop policy if exists rabbithole_assets_update_owner on storage.objects;
create policy rabbithole_assets_update_owner
on storage.objects
for update
to authenticated
using (bucket_id = 'rabbithole-assets' and owner = auth.uid())
with check (bucket_id = 'rabbithole-assets' and owner = auth.uid());

drop policy if exists rabbithole_assets_delete_owner on storage.objects;
create policy rabbithole_assets_delete_owner
on storage.objects
for delete
to authenticated
using (bucket_id = 'rabbithole-assets' and owner = auth.uid());
