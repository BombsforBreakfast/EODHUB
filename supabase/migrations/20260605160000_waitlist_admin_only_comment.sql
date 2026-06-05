-- Waitlist is retained for admin recruiting; public signup API removed with beta gate.

comment on table public.waitlist_signups is
  'Pre-signup member interest list. Admin read/delete via RLS; inserts via service role only (historical rows from login waitlist).';
