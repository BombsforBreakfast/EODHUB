-- Extend feed-images MIME allowlist for post attachment files (if restricted).
-- Buckets with allowed_mime_types = null already accept all types.

update storage.buckets
set allowed_mime_types = (
  select array(
    select distinct unnest(
      coalesce(allowed_mime_types, array[]::text[]) || array[
        'application/pdf',
        'application/octet-stream',
        'image/svg+xml',
        'image/tiff',
        'model/stl',
        'model/obj',
        'model/step',
        'model/iges',
        'model/3mf',
        'application/acad',
        'image/vnd.dxf'
      ]
    )
  )
)
where id = 'feed-images'
  and allowed_mime_types is not null;
