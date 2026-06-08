"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth/AuthProvider";
import BetaBugReportFab from "./bug-report/BetaBugReportFab";

/**
 * Shows the beta bug-report FAB only for signed-in users (any route, including login).
 */
export default function BugReportGate() {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [hideOnMobileSidebar, setHideOnMobileSidebar] = useState(false);

  useEffect(() => {
    const check = () => {
      setHideOnMobileSidebar(pathname === "/sidebar" && window.innerWidth <= 900);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [pathname]);

  if (isLoading) return null;
  if (!user) return null;
  if (hideOnMobileSidebar) return null;

  return <BetaBugReportFab />;
}
