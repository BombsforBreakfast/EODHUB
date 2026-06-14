/** Custom URL scheme registered in ios/App/App/Info.plist — must match Supabase redirect allowlist. */
export const NATIVE_OAUTH_REDIRECT_SCHEME = "com.eodhub.app";

/** OAuth callback target for Capacitor iOS/Android (not https — the shell intercepts appUrlOpen). */
export function buildNativeOAuthCallbackRedirect(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `${NATIVE_OAUTH_REDIRECT_SCHEME}://auth/callback?${params.toString()}`;
}

/** Map an appUrlOpen deep link to an in-app Next.js path. */
export function resolveNativeAppUrlOpenTarget(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === `${NATIVE_OAUTH_REDIRECT_SCHEME}:`) {
      if (parsed.host === "auth") {
        return `/auth${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
    if (parsed.host.includes("eod-hub.com")) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
  } catch {
    return null;
  }
  return null;
}
