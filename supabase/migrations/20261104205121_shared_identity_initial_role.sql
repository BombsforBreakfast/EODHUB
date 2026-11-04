-- GoTrue can insert a user with an empty initial role before assigning its
-- configured default. Treat that initial blank exactly like an omitted role.
-- Existing identities and explicit rental/ticketing/business roles are unchanged.
create or replace function portal_private.prepare_identity() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  if coalesce(nullif(new.role,''),'authenticated')='authenticated'
    and new.raw_app_meta_data->>'account_kind' is distinct from 'business_organization_page'
    and exists(select 1 from public.portal_auth_settings where id and enabled) then
    new.role:='eod_portal';
    new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')||'{"account_type":"shared_account"}'::jsonb;
  end if;
  return new;
end $$;
