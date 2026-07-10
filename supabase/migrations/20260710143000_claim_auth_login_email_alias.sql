-- When a user signs in with Google using a pre-registered alias email, move the
-- Google identity onto the canonical account and delete the duplicate OAuth user.
create or replace function public.claim_auth_login_email_alias(p_oauth_user_id uuid)
returns table (
  status text,
  primary_user_id uuid,
  primary_email text,
  error_message text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_oauth_email text;
  v_primary_user_id uuid;
  v_primary_email text;
  v_google_identity_id uuid;
begin
  select lower(trim(coalesce(
    (
      select i.identity_data->>'email'
      from auth.identities i
      where i.user_id = p_oauth_user_id
        and i.provider = 'google'
      limit 1
    ),
    (select u.email from auth.users u where u.id = p_oauth_user_id)
  )))
  into v_oauth_email;

  if v_oauth_email is null or v_oauth_email = '' then
    return query select 'unchanged', null::uuid, null::text, null::text;
    return;
  end if;

  select a.user_id, u.email
  into v_primary_user_id, v_primary_email
  from public.auth_login_email_aliases a
  join auth.users u on u.id = a.user_id
  where a.alias_email = v_oauth_email
    and u.deleted_at is null
  limit 1;

  if v_primary_user_id is null then
    return query select 'unchanged', null::uuid, null::text, null::text;
    return;
  end if;

  if v_primary_user_id = p_oauth_user_id then
    return query select 'unchanged', v_primary_user_id, v_primary_email, null::text;
    return;
  end if;

  select i.id
  into v_google_identity_id
  from auth.identities i
  where i.user_id = p_oauth_user_id
    and i.provider = 'google'
  limit 1;

  if v_google_identity_id is null then
    return query select 'error', null::uuid, null::text, 'No Google identity on OAuth session user.';
    return;
  end if;

  update auth.identities
  set user_id = v_primary_user_id,
      updated_at = now()
  where id = v_google_identity_id;

  update auth.users
  set raw_app_meta_data = jsonb_set(
        coalesce(raw_app_meta_data, '{}'::jsonb),
        '{providers}',
        case
          when coalesce(raw_app_meta_data->'providers', '[]'::jsonb) ? 'google' then
            coalesce(raw_app_meta_data->'providers', '[]'::jsonb)
          else
            coalesce(raw_app_meta_data->'providers', '[]'::jsonb) || '["google"]'::jsonb
        end
      ),
      updated_at = now()
  where id = v_primary_user_id;

  update public.notifications
  set recipient_user_id = v_primary_user_id
  where recipient_user_id = p_oauth_user_id;

  update public.page_sessions
  set user_id = v_primary_user_id
  where user_id = p_oauth_user_id;

  delete from public.notification_preferences
  where user_id = p_oauth_user_id;

  delete from public.profiles
  where user_id = p_oauth_user_id;

  delete from auth.sessions
  where user_id = p_oauth_user_id;

  delete from auth.one_time_tokens
  where user_id = p_oauth_user_id;

  delete from auth.users
  where id = p_oauth_user_id;

  return query select 'claimed', v_primary_user_id, v_primary_email, null::text;
end;
$$;

revoke all on function public.claim_auth_login_email_alias(uuid) from public;
grant execute on function public.claim_auth_login_email_alias(uuid) to service_role;
