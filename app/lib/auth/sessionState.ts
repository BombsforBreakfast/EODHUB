const APP_AUTH_SESSION_KEYS = ["eod_active"] as const;
const APP_AUTH_LOCAL_KEYS = ["eod_no_persist"] as const;

// OAuth logins leave the page (redirect to the provider), so the "Remember me"
// choice can't be applied inline. We stash it here before redirecting and apply
// it once the session lands back in the app (see SessionGuard).
const OAUTH_REMEMBER_PENDING_KEY = "eod_oauth_remember";
const NATIVE_OAUTH_IN_PROGRESS_KEY = "eod_native_oauth_in_progress";

export function markNativeOAuthInProgress() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(NATIVE_OAUTH_IN_PROGRESS_KEY, "1");
}

export function clearNativeOAuthInProgress() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(NATIVE_OAUTH_IN_PROGRESS_KEY);
}

export function isNativeOAuthInProgress(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(NATIVE_OAUTH_IN_PROGRESS_KEY) === "1";
}

/** Read pending OAuth remember choice without clearing it. */
export function peekOAuthRememberPending(): boolean | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(OAUTH_REMEMBER_PENDING_KEY);
  if (value === null) return null;
  return value === "1";
}

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

// The login page redirects a client-side session to a protected route, while
// proxy.ts independently validates auth via cookies. When those disagree — e.g.
// a mobile in-app browser or Safari ITP keeps the session in localStorage but
// drops/partitions the Supabase auth cookies — the two bounce the user back and
// forth, refreshing every ~0.5s. These helpers detect that bounce so the login
// page can break the loop and recover instead of refreshing forever.
const LOGIN_REDIRECT_COUNT_KEY = "eod_login_redirects";
const LOGIN_REDIRECT_TS_KEY = "eod_login_redirects_ts";
const LOGIN_REDIRECT_WINDOW_MS = 6000;

/**
 * Record one login → protected-route redirect attempt and return how many have
 * happened in quick succession. Attempts older than the window reset the count,
 * so a single healthy redirect never trips the loop detector.
 */
export function recordLoginRedirectAttempt(): number {
  if (typeof window === "undefined") return 0;
  const now = Date.now();
  const lastTs = Number(window.sessionStorage.getItem(LOGIN_REDIRECT_TS_KEY) ?? "0");
  const prevCount = Number(window.sessionStorage.getItem(LOGIN_REDIRECT_COUNT_KEY) ?? "0");
  const withinWindow = now - lastTs < LOGIN_REDIRECT_WINDOW_MS;
  const count = withinWindow ? prevCount + 1 : 1;
  window.sessionStorage.setItem(LOGIN_REDIRECT_COUNT_KEY, String(count));
  window.sessionStorage.setItem(LOGIN_REDIRECT_TS_KEY, String(now));
  return count;
}

export function clearLoginRedirectAttempts() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOGIN_REDIRECT_COUNT_KEY);
  window.sessionStorage.removeItem(LOGIN_REDIRECT_TS_KEY);
}
