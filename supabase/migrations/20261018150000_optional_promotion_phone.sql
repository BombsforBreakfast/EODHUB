begin;

-- Keep existing numbers and required contact/brief fields. A missing phone is
-- normalized to an empty string by server validation, rather than SQL NULL.
alter table public.promotion_requests drop constraint promotion_requests_phone_check;
alter table public.promotion_requests add constraint promotion_requests_phone_check
  check (phone = '' or length(phone) between 7 and 40);
alter table public.promotion_requests alter column phone set default '';

commit;
