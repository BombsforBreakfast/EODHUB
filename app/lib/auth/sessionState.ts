const APP_AUTH_SESSION_KEYS = ["eod_active"] as const;
const APP_AUTH_LOCAL_KEYS = ["eod_no_persist"] as const;

// OAuth logins leave the page (redirect to the provider), so the "Remember me"
// choice can't be applied inline. We stash it here before redirecting and apply
// it once the session lands back in the app (see SessionGuard).
const OAUTH_REMEMBER_PENDING_KEY = "eod_oauth_remember";

export function clearAppAuthState() {
  if (typeof window === "undefined") return;
  for (const key of APP_AUTH_SESSION_KEYS) {
    window.sessionStorage.removeItem(key);
  }
  for (const key of APP_AUTH_LOCAL_KEYS) {
    window.localStorage.removeItem(key);
  }
}

export function markAppSessionActive(rememberMe: boolean) {
  if (typeof window === "undefined") return;
  if (!rememberMe) {
    window.localStorage.setItem("eod_no_persist", "1");
  } else {
    window.localStorage.removeItem("eod_no_persist");
  }
  window.sessionStorage.setItem("eod_active", "1");
}

/** Stash the "Remember me" choice before an OAuth redirect. */
export function markOAuthRememberPending(rememberMe: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OAUTH_REMEMBER_PENDING_KEY, rememberMe ? "1" : "0");
}

/**
 * Read and clear the pending OAuth "Remember me" choice.
 * Returns null when there is no pending OAuth login to apply.
 */
export function consumeOAuthRememberPending(): boolean | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(OAUTH_REMEMBER_PENDING_KEY);
  if (value === null) return null;
  window.localStorage.removeItem(OAUTH_REMEMBER_PENDING_KEY);
  return value === "1";
}
