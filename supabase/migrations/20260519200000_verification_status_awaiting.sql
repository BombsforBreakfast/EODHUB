-- Normalize verification_status values to awaiting_* naming (app canonical).

update public.profiles
set verification_status = 'awaiting_email_verification'
where verification_status = 'pending_email_verification';

update public.profiles
set verification_status = 'awaiting_admin_review'
where verification_status = 'pending_admin_review';

-- Users stuck in legacy `pending` without email verification should re-verify.
update public.profiles
set
  email_verified = false,
  verification_status = 'awaiting_email_verification'
where verification_status = 'pending'
  and coalesce(email_verified, false) = false;
