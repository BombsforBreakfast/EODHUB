-- Legacy admin delete soft-marked rows as is_rejected; remove them permanently.
delete from public.saved_jobs sj
using public.jobs j
where sj.job_id = j.id
  and j.is_rejected = true;

delete from public.jobs
where is_rejected = true;
