-- Raise feed-images bucket cap for Pro-tier short video uploads (100 MB).

update storage.buckets
set file_size_limit = 104857600 -- 100 MB: feed images + short video
where id = 'feed-images';
