-- Reports are private allegations for review, never public ratings or automatic takedowns.
create table public.rental_listing_flags (
  id uuid primary key,
  listing_id text not null,
  owner_id text not null,
  address text not null,
  city text not null,
  state text not null,
  reason text not null check(reason in ('inaccurate','suspicious','condition','contact','other')),
  details text not null check(length(details) between 15 and 2000),
  contact_email text not null default '' check(length(contact_email)<=254),
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  review_note text not null default '' check(length(review_note)<=2000),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index rental_listing_flags_queue on public.rental_listing_flags(status,created_at desc,id);
create index rental_listing_flags_listing on public.rental_listing_flags(listing_id);
create table public.rental_listing_moderation (
  listing_id text primary key,
  hidden boolean not null default false,
  reason text not null check(length(reason) between 5 and 2000),
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.rental_listing_flags enable row level security;
alter table public.rental_listing_moderation enable row level security;
revoke all on public.rental_listing_flags,public.rental_listing_moderation from public,anon,authenticated,eod_rental;
grant select,insert,update on public.rental_listing_flags,public.rental_listing_moderation to service_role;

-- Admin holds are separate from owner visibility and cannot be undone in the portal.
create function public.rental_set_moderation(p_listing text,p_hidden boolean,p_note text,p_admin uuid,p_revision integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  if p_hidden is null or p_note is null or length(trim(p_note))<5 or length(p_note)>2000 then raise exception 'Add a review note'; end if;
  if p_revision=0 then
    insert into public.rental_listing_moderation(listing_id,hidden,reason,updated_by)
    values(p_listing,p_hidden,trim(p_note),p_admin) on conflict do nothing;
  else
    update public.rental_listing_moderation set hidden=p_hidden,reason=trim(p_note),updated_by=p_admin,updated_at=now(),revision=revision+1
    where listing_id=p_listing and revision=p_revision;
  end if;
  get diagnostics changed=row_count;
  return changed=1;
end;
$$;
revoke all on function public.rental_set_moderation(text,boolean,text,uuid,integer) from public,anon,authenticated,eod_rental;
grant execute on function public.rental_set_moderation(text,boolean,text,uuid,integer) to service_role;
