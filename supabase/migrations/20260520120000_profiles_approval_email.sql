-- Track admin/community approval time and idempotent approval email delivery.

alter table public.profiles
  add column if not exists admin_approved_at timestamptz null,
  add column if not exists approval_email_sent_at timestamptz null;

comment on column public.profiles.admin_approved_at is
  'When the account was approved (admin action or 3 vouches).';
comment on column public.profiles.approval_email_sent_at is
  'When the branded full-access approval email was successfully sent via Resend.';

update public.profiles
set admin_approved_at = coalesce(admin_approved_at, email_verified_at, created_at)
where verification_status = 'verified'
  and admin_verified = true
  and admin_approved_at is null;
