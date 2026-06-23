"use client";

import { useEffect } from "react";
import { supabase } from "../lib/lib/supabaseClient";
import { useAuth } from "../lib/auth/AuthProvider";
import {
  clearAppAuthState,
  consumeOAuthRememberPending,
  isNativeOAuthInProgress,
  markAppSessionActive,
  peekOAuthRememberPending,
} from "../lib/auth/sessionState";
import { oauthDebugLog } from "../lib/auth/oauthDebugLog";

const SESSION_RETRY_ATTEMPTS = 6;
const SESSION_RETRY_DELAY_MS = 500;

async function getSessionWithRetry(): Promise<boolean> {
  for (let attempt = 0; attempt < SESSION_RETRY_ATTEMPTS; attempt++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return true;
    if (
      attempt < SESSION_RETRY_ATTEMPTS - 1 &&
      (isNativeOAuthInProgress() || peekOAuthRememberPending() !== null)
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, SESSION_RETRY_DELAY_MS));
      continue;
    }
    return false;
  }
  return false;
}

// Handles "Remember me" — if the user unchecked it, sign them out when
// they reopen the browser (sessionStorage is cleared on browser close).
export default function SessionGuard() {
  const { isLoading } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isLoading) return;

    let cancelled = false;

    void (async () => {
      // If we just returned from an OAuth login, apply the stashed "Remember me"
      // choice once the session is confirmed, then skip the sign-out check for
      // this load (eod_active was just set).
      const pendingRemember = consumeOAuthRememberPending();
      if (pendingRemember !== null) {
        const hasSession = await getSessionWithRetry();
        if (cancelled) return;
        if (hasSession) {
          markAppSessionActive(pendingRemember);
          oauthDebugLog("session_guard_oauth_remember_applied", { rememberMe: pendingRemember });
          return;
        }
        oauthDebugLog("session_guard_oauth_pending_no_session", {});
      }

      if (isNativeOAuthInProgress() || peekOAuthRememberPending() !== null) {
        oauthDebugLog("session_guard_defer_signout", { oauthInProgress: isNativeOAuthInProgress() });
        return;
      }

      const nopersist = localStorage.getItem("eod_no_persist") === "1";
      const stillAlive = sessionStorage.getItem("eod_active") === "1";
      if (nopersist && !stillAlive) {
        clearAppAuthState();
        await supabase.auth.signOut();
        if (!cancelled) window.location.href = "/login";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading]);

  return null;
}
