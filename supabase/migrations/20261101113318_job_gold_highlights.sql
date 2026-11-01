-- Editorial curation is independent of approval, import payloads and inferred tags.
alter table public.jobs
  add column gold_highlight boolean not null default false,
  add column gold_tags text[] not null default '{}',
  add column gold_revision integer not null default 0,
  add column gold_updated_at timestamptz,
  add constraint jobs_gold_shape check(cardinality(gold_tags)<=6 and coalesce(array_ndims(gold_tags),1)=1 and (not gold_highlight or cardinality(gold_tags)>0));
create index jobs_gold_highlights on public.jobs(created_at desc,id) where gold_highlight and is_approved and not is_rejected;

create table public.job_priority_rules (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  phrase text not null check(length(phrase) between 3 and 100 and phrase ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  mission_required boolean not null default true,
  target_score integer not null default 90 check(target_score in(90,100)),
  created_at timestamptz not null default now()
);
create unique index job_priority_title_rule on public.job_priority_rules(phrase) where job_id is null;
create unique index job_priority_listing_rule on public.job_priority_rules(job_id) where job_id is not null;
alter table public.job_priority_rules enable row level security;
revoke all on public.job_priority_rules from public,anon,authenticated,eod_rental;
grant select,insert,update,delete on public.job_priority_rules to service_role;

-- Job owners can edit their jobs under existing RLS, but cannot grant gold labels.
create function public.protect_job_gold_highlight() returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
  if tg_op='INSERT' then changed=new.gold_highlight or cardinality(new.gold_tags)>0 or new.gold_revision<>0 or new.gold_updated_at is not null;
  else changed=row(new.gold_highlight,new.gold_tags,new.gold_revision,new.gold_updated_at) is distinct from row(old.gold_highlight,old.gold_tags,old.gold_revision,old.gold_updated_at);end if;
  if changed and current_user not in('postgres','service_role') then
    if not exists(select 1 from public.profiles where user_id=(select auth.uid()) and is_admin=true) then raise exception 'Only administrators can curate gold jobs' using errcode='42501';end if;
  end if;
  if changed then
    if tg_op='INSERT' then new.gold_revision=1;else new.gold_revision=old.gold_revision+1;end if;new.gold_updated_at=now();
  end if;
  if exists(select 1 from unnest(new.gold_tags) t where t is null or length(trim(t)) not between 1 and 40 or t ~ '[[:cntrl:]]') then raise exception 'Invalid gold label';end if;
  return new;
end;$$;
create trigger protect_job_gold_highlight before insert or update on public.jobs for each row execute function public.protect_job_gold_highlight();
revoke all on function public.protect_job_gold_highlight() from public,anon,authenticated,eod_rental;

create function public.set_job_gold_highlight(p_id uuid,p_enabled boolean,p_tags text[],p_revision integer,p_phrase text default null,p_mission boolean default true,p_score integer default 90,p_job_only boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.jobs%rowtype;
begin
  select * into target from public.jobs where id=p_id and is_rejected is not true for update;
  if not found or p_revision is null or target.gold_revision<>p_revision then return null;end if;
  if p_enabled is null or p_tags is null or cardinality(p_tags)>6 or (p_enabled and cardinality(p_tags)=0) then raise exception 'Add 1–6 gold tags';end if;
  update public.jobs set gold_highlight=p_enabled,gold_tags=case when p_enabled then p_tags else '{}' end,gold_revision=gold_revision+1,gold_updated_at=now() where id=p_id returning * into target;
  if p_phrase is not null then
    if p_job_only then
      insert into public.job_priority_rules(job_id,phrase,mission_required,target_score) values(p_id,p_phrase,false,p_score)
      on conflict(job_id) where job_id is not null do update set phrase=excluded.phrase,target_score=excluded.target_score;
    else
      insert into public.job_priority_rules(phrase,mission_required,target_score) values(p_phrase,p_mission,p_score)
      on conflict(phrase) where job_id is null do update set mission_required=excluded.mission_required,target_score=excluded.target_score;
    end if;
  end if;
  return jsonb_build_object('gold_highlight',target.gold_highlight,'gold_tags',target.gold_tags,'gold_revision',target.gold_revision,'gold_updated_at',target.gold_updated_at);
end;$$;
revoke all on function public.set_job_gold_highlight(uuid,boolean,text[],integer,text,boolean,integer,boolean) from public,anon,authenticated,eod_rental;
grant execute on function public.set_job_gold_highlight(uuid,boolean,text[],integer,text,boolean,integer,boolean) to service_role;
