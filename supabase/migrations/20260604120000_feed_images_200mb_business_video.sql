-- Raise feed-images bucket cap so business organization accounts can upload 200 MB videos.
-- Member-facing clients still enforce 100 MB; business_org profiles enforce 200 MB in app code.

update storage.buckets
set file_size_limit = 209715200 -- 200 MB
where id = 'feed-images';
