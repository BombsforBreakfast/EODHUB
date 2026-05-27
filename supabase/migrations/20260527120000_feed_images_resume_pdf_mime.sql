-- Resume uploads from mobile (especially iOS) may send application/pdf or
-- application/octet-stream. Ensure feed-images allows document MIME types when
-- a restrictive allowlist is configured; buckets with allowed_mime_types = null
-- already accept all types and are unchanged.

update storage.buckets
set allowed_mime_types = (
  select array(
    select distinct unnest(
      coalesce(allowed_mime_types, array[]::text[]) || array[
        'application/pdf',
        'application/octet-stream',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'application/rtf',
        'application/vnd.oasis.opendocument.text'
      ]
    )
  )
)
where id = 'feed-images'
  and allowed_mime_types is not null
  and not ('application/pdf' = any(allowed_mime_types));
