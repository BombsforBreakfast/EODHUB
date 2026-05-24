-- Drop the NOT NULL on the deprecated profile_connections.connection_type
-- column. The 20260408060531 refactor switched application code to use
-- (status, worked_with) and marked connection_type as DEPRECATED, but left
-- the NOT NULL constraint in place. As a result every v2-style insert from
-- the app silently fails with:
--
--   null value in column "connection_type" of relation
--   "profile_connections" violates not-null constraint
--
-- This breaks the "Know" button in the People You May Know carousel and
-- the profile-page requestKnow handler. Dropping NOT NULL lets new code
-- omit the field; legacy code paths that still set connection_type
-- continue to work unchanged.
--
-- Also re-asserts the privacy_who_can_request default so accounts always
-- accept connection requests by default. The column was added with this
-- default in 20260420030000, but we re-set it here defensively and patch
-- any NULL rows that may have escaped the original backfill.

begin;

alter table public.profile_connections
  alter column connection_type drop not null;

comment on column public.profile_connections.connection_type is
  'DEPRECATED: legacy two-bucket field, now nullable. Use status + worked_with instead.';

-- Defensive backfill — no-op when every row already has the default value,
-- which it should after 20260420030000 ran.
update public.profiles
set privacy_who_can_request = 'everyone'
where privacy_who_can_request is null;

alter table public.profiles
  alter column privacy_who_can_request set default 'everyone';

commit;
