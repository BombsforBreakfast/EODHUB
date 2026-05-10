"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import BetaBugReportFab from "./bug-report/BetaBugReportFab";

/**
 * Shows the beta bug-report FAB only for signed-in users (any route, including login/waitlist).
 */
export default function BugReportGate() {
  const [userId, setUserId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (userId === undefined) return null;
  if (!userId) return null;

  return <BetaBugReportFab />;
}
