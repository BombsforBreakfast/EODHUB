-- Enforce per-bucket upload size limits at the storage layer.

update storage.buckets
set file_size_limit = 52428800 -- 50 MB: feed images + short video
where id = 'feed-images';

update storage.buckets
set file_size_limit = 8388608 -- 8 MB: profile avatars
where id = 'profile-photos';

update storage.buckets
set file_size_limit = 26214400 -- 25 MB: RabbitHole documents
where id = 'rabbithole-assets';

update storage.buckets
set file_size_limit = 26214400 -- 25 MB: memorial photos/docs
where id = 'memorial-scrapbook';

update storage.buckets
set file_size_limit = 8388608 -- 8 MB: bug report screenshots
where id = 'bug-report-screenshots';

update storage.buckets
set file_size_limit = 8388608 -- 8 MB: business listing images
where id = 'business-images';
