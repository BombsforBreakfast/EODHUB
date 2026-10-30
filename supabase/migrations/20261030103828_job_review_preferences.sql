-- Private, shared admin-review preferences. No public/client table or RPC access.
create table public.job_type_exclusions (
  id uuid primary key default gen_random_uuid(),
  phrase text not null unique check (length(phrase) between 3 and 100 and phrase ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);
create table public.job_review_feedback (
  job_id uuid primary key,
  title text not null,
  company_name text,
  location text,
  decision text not null check (decision in ('approved','not_relevant')),
  created_at timestamptz not null default now()
);
create index job_review_feedback_recent on public.job_review_feedback (created_at desc, job_id);
alter table public.job_type_exclusions enable row level security;
alter table public.job_review_feedback enable row level security;
revoke all on public.job_type_exclusions, public.job_review_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.job_type_exclusions, public.job_review_feedback to service_role;

-- Record the decision in the same transaction as approval/rejection. Each listing has one current vote.
-- No foreign key: snapshots survive normal stale-job purges without resurrecting listings.
create function public.record_job_review_decision(target_job_id uuid, review_decision text, pending_only boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target public.jobs%rowtype;
begin
  if review_decision not in ('approved','not_relevant') then raise exception 'Invalid job review decision'; end if;
  select * into target from public.jobs where id = target_job_id for update;
  if not found or (pending_only and target.is_approved is true) then return null; end if;
  if review_decision = 'approved' then
    if target.is_rejected is true then return null; end if;
    if target.is_approved is true then return target.id; end if;
    update public.jobs set is_approved = true where id = target.id;
  else
    update public.jobs set is_approved = false, is_rejected = true where id = target.id;
  end if;
  insert into public.job_review_feedback as feedback (job_id,title,company_name,location,decision)
  values (target.id,coalesce(target.title,''),target.company_name,target.location,review_decision)
  on conflict (job_id) do update set decision=excluded.decision, title=excluded.title,
    company_name=excluded.company_name, location=excluded.location, created_at=now()
    where feedback.decision is distinct from excluded.decision;
  return target.id;
end;
$$;
revoke all on function public.record_job_review_decision(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.record_job_review_decision(uuid,text,boolean) to service_role;
