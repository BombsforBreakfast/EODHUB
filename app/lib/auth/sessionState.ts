const APP_AUTH_SESSION_KEYS = ["eod_active"] as const;
const APP_AUTH_LOCAL_KEYS = ["eod_no_persist"] as const;

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
