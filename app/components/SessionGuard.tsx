"use client";

import { useEffect } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { clearAppAuthState } from "../lib/auth/sessionState";

// Handles "Remember me" — if the user unchecked it, sign them out when
// they reopen the browser (sessionStorage is cleared on browser close).
export default function SessionGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const nopersist = localStorage.getItem("eod_no_persist") === "1";
    const stillAlive = sessionStorage.getItem("eod_active") === "1";
    if (nopersist && !stillAlive) {
      clearAppAuthState();
      supabase.auth.signOut().then(() => {
        window.location.href = "/login";
      });
    }
  }, []);

  return null;
}
