-- International memorials: country/org, expanded categories, approval queue.

-- Drop legacy category check (column-level name from 20260426155500).
alter table public.memorials drop constraint if exists memorials_category_check;

alter table public.memorials
  add column if not exists is_international boolean not null default false,
  add column if not exists country text,
  add column if not exists organization text,
  add column if not exists verification_status text not null default 'approved';

-- Expand allowed categories for international types (US keeps military / leo_fed).
alter table public.memorials
  add constraint memorials_category_check
  check (
    category in (
      'military',
      'leo_fed',
      'civil_service',
      'law_enforcement',
      'federal',
      'humanitarian_mine_action'
    )
  );

alter table public.memorials
  drop constraint if exists memorials_verification_status_check;

alter table public.memorials
  add constraint memorials_verification_status_check
  check (verification_status in ('pending', 'approved', 'rejected'));

comment on column public.memorials.is_international is
  'True when submitted via the International memorial path (admin approval required).';
comment on column public.memorials.country is
  'ISO 3166-1 alpha-2 for international memorials.';
comment on column public.memorials.organization is
  'Optional unit / agency / NGO for international memorials.';
comment on column public.memorials.verification_status is
  'pending | approved | rejected. Legacy and U.S. memorials are approved.';

-- Existing rows stay public.
update public.memorials
set
  is_international = false,
  verification_status = 'approved'
where verification_status is null
   or verification_status not in ('pending', 'approved', 'rejected');

create index if not exists memorials_public_anniversary_idx
  on public.memorials (verification_status, death_date);

create index if not exists memorials_pending_intl_idx
  on public.memorials (verification_status, is_international)
  where is_international = true and verification_status = 'pending';

-- Enforce: international member submissions stay pending; only admins can approve.
-- U.S. path always publishes as approved.
create or replace function public.memorials_enforce_intl_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_is_admin boolean := false;
begin
  select coalesce(p.is_admin, false)
    into actor_is_admin
  from public.profiles p
  where p.user_id = auth.uid()
  limit 1;

  if tg_op = 'INSERT' then
    if coalesce(new.is_international, false) then
      if coalesce(actor_is_admin, false) then
        -- Admins may publish international memorials immediately.
        if new.verification_status is null
           or new.verification_status not in ('pending', 'approved', 'rejected') then
          new.verification_status := 'approved';
        end if;
      else
        new.verification_status := 'pending';
      end if;
    else
      new.is_international := false;
      new.verification_status := 'approved';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not coalesce(actor_is_admin, false) then
      new.verification_status := old.verification_status;
      new.is_international := old.is_international;
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists memorials_enforce_intl_verification on public.memorials;
create trigger memorials_enforce_intl_verification
  before insert or update on public.memorials
  for each row
  execute function public.memorials_enforce_intl_verification();
