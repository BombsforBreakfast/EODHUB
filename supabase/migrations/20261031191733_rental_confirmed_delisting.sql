alter table public.rental_providers add column delisted_at timestamptz;
alter table public.rental_properties add column delisted_at timestamptz;
alter table public.rental_listing_moderation add column permanent boolean not null default false;
create table public.rental_delistings (
  id uuid primary key default gen_random_uuid(), listing_id text not null unique,
  provider_id text not null, label text not null, plan text not null check(plan in('monthly','annual','legacy')),
  reason text not null check(length(reason) between 5 and 2000), effective_at timestamptz not null default now(),
  state text not null default 'pending' check(state in('pending','refund_due','manual_review','completed')),
  subscription_id text, invoice_id text, refund_cents integer check(refund_cents>=0),
  refunded_cents integer not null default 0 check(refunded_cents>=0), refund_id text unique,
  result_note text, last_error text, created_by uuid references auth.users(id) on delete set null,
  refund_recorded_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz, updated_at timestamptz not null default now()
);
create index rental_delistings_queue on public.rental_delistings(state,effective_at);
alter table public.rental_delistings enable row level security;
revoke all on public.rental_delistings from public,anon,authenticated,eod_rental;
grant select,insert,update on public.rental_delistings to service_role;

create function public.rental_preserve_delisting() returns trigger language plpgsql set search_path='' as $$
begin
  if old.delisted_at is not null then new.delisted_at=old.delisted_at; end if;
  if new.delisted_at is not null then
    if tg_table_name='rental_providers' then new.status='suspended';
    else new.hidden=true;new.auto_renew=false;new.review_status='rejected';end if;
  end if;
  return new;
end;$$;
create trigger rental_property_final_delisting before update on public.rental_properties for each row execute function public.rental_preserve_delisting();
create trigger rental_provider_final_delisting before update on public.rental_providers for each row execute function public.rental_preserve_delisting();
revoke all on function public.rental_preserve_delisting() from public,anon,authenticated,eod_rental;

create function public.rental_queue_delisting(p_id text,p_owner text,p_label text,p_plan text,p_reason text,p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare effective timestamptz;
begin
  insert into public.rental_delistings(listing_id,provider_id,label,plan,reason,created_by)
  values(p_id,p_owner,p_label,p_plan,p_reason,p_actor) on conflict(listing_id) do nothing;
  select effective_at into effective from public.rental_delistings where listing_id=p_id;
  if p_plan<>'legacy' then update public.rental_properties set delisted_at=effective,hidden=true,auto_renew=false where id=p_id::uuid and provider_id::text=p_owner;end if;
  insert into public.rental_listing_moderation(listing_id,hidden,permanent,reason,updated_by)
  values(p_id,true,true,p_reason,p_actor)
  on conflict(listing_id) do update set hidden=true,permanent=true,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now(),revision=rental_listing_moderation.revision+1;
end;$$;
create function public.rental_confirm_delisting(p_scope text,p_target text,p_reason text,p_actor uuid,p_legacy_owner text default '',p_legacy_label text default '')
returns setof public.rental_delistings language plpgsql security invoker set search_path='' as $$
declare row public.rental_properties;
begin
  if p_reason is null or length(trim(p_reason))<5 or length(p_reason)>2000 then raise exception 'Record a reason';end if;
  if p_scope='provider' then
    update public.rental_providers set status='suspended',delisted_at=coalesce(delisted_at,now()),review_note=p_reason where user_id=p_target::uuid;
    if not found then raise exception 'Provider not found';end if;
    for row in select * from public.rental_properties where provider_id=p_target::uuid for update loop
      perform public.rental_queue_delisting(row.id::text,row.provider_id::text,coalesce(row.published->>'address',row.draft->>'address','Property'),row.plan,p_reason,p_actor);
    end loop;
    return query select * from public.rental_delistings where provider_id=p_target;
  elsif p_scope='property' then
    if p_legacy_owner<>'' then
      perform public.rental_queue_delisting(p_target,p_legacy_owner,p_legacy_label,'legacy',p_reason,p_actor);
    else
      select * into row from public.rental_properties where id=p_target::uuid for update;
      if not found then raise exception 'Property not found';end if;
      perform public.rental_queue_delisting(row.id::text,row.provider_id::text,coalesce(row.published->>'address',row.draft->>'address','Property'),row.plan,p_reason,p_actor);
    end if;
    return query select * from public.rental_delistings where listing_id=p_target;
  else raise exception 'Unknown scope';end if;
end;$$;
revoke all on function public.rental_queue_delisting(text,text,text,text,text,uuid),public.rental_confirm_delisting(text,text,text,uuid,text,text) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_queue_delisting(text,text,text,text,text,uuid),public.rental_confirm_delisting(text,text,text,uuid,text,text) to service_role;

create or replace function public.rental_set_moderation(p_listing text,p_hidden boolean,p_note text,p_admin uuid,p_revision integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_hidden is null or p_note is null or length(trim(p_note))<5 or length(p_note)>2000 then raise exception 'Add a review note';end if;
  if p_revision=0 then
    insert into public.rental_listing_moderation(listing_id,hidden,reason,updated_by) values(p_listing,p_hidden,trim(p_note),p_admin) on conflict do nothing;
  else
    update public.rental_listing_moderation set hidden=p_hidden,reason=trim(p_note),updated_by=p_admin,updated_at=now(),revision=revision+1 where listing_id=p_listing and revision=p_revision and not permanent;
  end if;
  get diagnostics changed=row_count;return changed=1;
end;$$;
