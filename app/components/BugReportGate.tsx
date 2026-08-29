"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth/AuthProvider";
import { PRODUCT_FEATURE_FLAGS } from "../lib/productFeatureFlags";
import { supabase } from "../lib/lib/supabaseClient";
import BetaBugReportFab from "./bug-report/BetaBugReportFab";

/**
 * Bug-report FAB for admins and founders only — keeps the chrome clean for
 * regular members while still giving operators a quick report path.
 * Parked via PRODUCT_FEATURE_FLAGS.bugBombEnabled.
 */
export default function BugReportGate() {
  const pathname = usePathname();
  const { user, accessToken, isLoading } = useAuth();
  const [hideOnMobileSidebar, setHideOnMobileSidebar] = useState(false);
  const [canReport, setCanReport] = useState(false);

  useEffect(() => {
    if (!PRODUCT_FEATURE_FLAGS.bugBombEnabled) return;
    const check = () => {
      setHideOnMobileSidebar(pathname === "/sidebar" && window.innerWidth <= 900);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [pathname]);

  useEffect(() => {
    if (!PRODUCT_FEATURE_FLAGS.bugBombEnabled) return;
    let cancelled = false;

    async function loadAccess() {
      if (!user) {
        if (!cancelled) setCanReport(false);
        return;
      }

      let admin = false;
      let founder = false;

      try {
        const { data } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("user_id", user.id)
          .maybeSingle();
        admin = Boolean((data as { is_admin?: boolean | null } | null)?.is_admin);
      } catch {
        admin = false;
      }

      if (accessToken) {
        try {
          const res = await fetch("/api/me/is-founder", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (res.ok) {
            const body = (await res.json()) as { isFounder?: boolean };
            founder = body.isFounder === true;
          }
        } catch {
          founder = false;
        }
      }

      if (!cancelled) setCanReport(admin || founder);
    }

    void loadAccess();
    return () => {
      cancelled = true;
    };
  }, [user, accessToken]);

  if (!PRODUCT_FEATURE_FLAGS.bugBombEnabled) return null;
  if (isLoading) return null;
  if (!user) return null;
  if (!canReport) return null;
  if (hideOnMobileSidebar) return null;

  return <BetaBugReportFab />;
}
