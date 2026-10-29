-- GoTrue's admin createUser inserts the Auth user first, then assigns role and
-- app_metadata in separate UPDATEs inside the same transaction. Finish rental
-- provisioning when both server-controlled attributes have been assigned.
-- Existing Auth functions/triggers and ordinary member creation are unchanged.
create function public.finish_rental_auth_provisioning() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='eod_rental' and new.raw_app_meta_data->>'account_type'='rental_provider' then
    if exists(select 1 from public.profiles where user_id=new.id) then
      -- Only the placeholder created by this very Auth transaction may be
      -- removed. Converting an established Hub account is forbidden.
      if exists(select 1 from public.profiles where user_id=new.id and (xmin<>pg_current_xact_id()::xid or created_at is distinct from transaction_timestamp())) then
        raise exception 'Existing Hub members require a separate rental identity' using errcode='42501';
      end if;
      delete from public.profiles where user_id=new.id and xmin=pg_current_xact_id()::xid and created_at=transaction_timestamp();
    end if;
    if not exists(select 1 from public.rental_providers where user_id=new.id) then
      insert into public.rental_providers(user_id,full_name,phone,email,company,commitment_version)
      values(new.id,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'phone',lower(new.email),
        coalesce(new.raw_user_meta_data->>'company',''),'2026-10-27-v1');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.finish_rental_auth_provisioning() from public,anon,authenticated,eod_rental;
create trigger ensure_rental_auth_provisioning after update of role,raw_app_meta_data on auth.users
for each row execute function public.finish_rental_auth_provisioning();
