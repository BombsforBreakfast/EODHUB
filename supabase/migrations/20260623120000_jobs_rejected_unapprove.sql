-- Legacy admin delete soft-marked rows as is_rejected; remove them permanently.
-- job_stale_flags rows cascade via FK when jobs are deleted.
delete from public.jobs
where is_rejected = true;
