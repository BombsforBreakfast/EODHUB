-- Enable Supabase Realtime for event_attendance so left-rail + feed RSVP UI
-- can subscribe to postgres_changes. Safe to run multiple times.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'event_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_attendance;
  END IF;
END $$;
