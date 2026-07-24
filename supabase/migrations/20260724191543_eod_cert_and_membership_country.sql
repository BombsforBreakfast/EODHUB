-- EOD verification cert (private storage) + optional membership country (nullable for legacy users).

alter table public.profiles
  add column if not exists country text,
  add column if not exists eod_cert_path text,
  add column if not exists eod_cert_file_name text,
  add column if not exists eod_cert_uploaded_at timestamptz;

comment on column public.profiles.country is
  'ISO 3166-1 alpha-2 membership country (allowlisted partners). Nullable for legacy users.';

comment on column public.profiles.eod_cert_path is
  'Private storage object path in verification-docs bucket for EOD certificate.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {auth.uid()}/eod-cert/...
drop policy if exists verification_docs_select_own on storage.objects;
create policy verification_docs_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'verification-docs'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists verification_docs_insert_own on storage.objects;
create policy verification_docs_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'verification-docs'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists verification_docs_update_own on storage.objects;
create policy verification_docs_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'verification-docs'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'verification-docs'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists verification_docs_delete_own on storage.objects;
create policy verification_docs_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'verification-docs'
  and split_part(name, '/', 1) = auth.uid()::text
);
