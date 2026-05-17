-- Waitlist inserts go through POST /api/waitlist (validated server-side). Admin select/delete unchanged.

begin;

drop policy if exists waitlist_signups_insert_public on public.waitlist_signups;

commit;
