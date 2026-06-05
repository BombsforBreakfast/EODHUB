"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/lib/supabaseClient";
import BetaBugReportFab from "./bug-report/BetaBugReportFab";

/**
 * Shows the beta bug-report FAB only for signed-in users (any route, including login).
 */
export default function BugReportGate() {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [hideOnMobileSidebar, setHideOnMobileSidebar] = useState(false);

  useEffect(() => {
    const check = () => {
      setHideOnMobileSidebar(pathname === "/sidebar" && window.innerWidth <= 900);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [pathname]);

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
  if (hideOnMobileSidebar) return null;

  return <BetaBugReportFab />;
}
