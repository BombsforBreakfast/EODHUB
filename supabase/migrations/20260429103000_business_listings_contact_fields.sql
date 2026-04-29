alter table public.business_listings
  add column if not exists poc_name text,
  add column if not exists phone_number text,
  add column if not exists contact_email text,
  add column if not exists city_state text;

comment on column public.business_listings.poc_name is
  'Optional resource/business point-of-contact name shown in the resource modal.';
comment on column public.business_listings.phone_number is
  'Optional resource/business contact phone shown in the resource modal.';
comment on column public.business_listings.contact_email is
  'Optional resource/business contact email shown in the resource modal.';
comment on column public.business_listings.city_state is
  'Optional resource/business city/state text shown in the resource modal.';
