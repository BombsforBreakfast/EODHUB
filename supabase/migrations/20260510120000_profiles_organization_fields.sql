-- Organization / business community accounts (account_type = 'organization').
-- Paid community parity with members; not employers. Keep is_employer = false for predictable UI/permissions.

begin;

alter table public.profiles
  add column if not exists organization_contact_name text,
  add column if not exists organization_contact_email text,
  add column if not exists organization_phone text,
  add column if not exists organization_location text;

comment on column public.profiles.organization_contact_name is
  'Public-facing contact name for organization profiles.';
comment on column public.profiles.organization_contact_email is
  'Public-facing contact email for organization profiles (may differ from sign-in email).';
comment on column public.profiles.organization_phone is
  'Public-facing phone for organization profiles.';
comment on column public.profiles.organization_location is
  'Free-form location line for organization profiles.';

commit;
