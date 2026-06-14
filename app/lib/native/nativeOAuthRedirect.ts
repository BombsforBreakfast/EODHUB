/** Production origin — must match capacitor.config.ts server.url (no www redirect). */
export const NATIVE_APP_ORIGIN = "https://eod-hub.com";

/** Custom URL scheme registered in ios/App/App/Info.plist — must match Supabase redirect allowlist. */
export const NATIVE_OAUTH_REDIRECT_SCHEME = "com.eodhub.app";

/** HTTPS bridge loaded in the OAuth browser sheet; hands off to the native scheme. */
export const NATIVE_OAUTH_BRIDGE_PATH = "/auth/app-callback";

/**
 * Supabase redirectTo for Capacitor — HTTPS URL Supabase always accepts.
 * The bridge page rewrites to com.eodhub.app://auth/callback?code=…
 */
export function buildNativeOAuthRedirectTo(nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `${NATIVE_APP_ORIGIN}${NATIVE_OAUTH_BRIDGE_PATH}?${params.toString()}`;
}

/** Deep link target after the bridge page hands off to the native scheme. */
export function buildNativeOAuthDeepLink(search: string, hash = ""): string {
  return `${NATIVE_OAUTH_REDIRECT_SCHEME}://auth/callback${search}${hash}`;
}

/** Map an appUrlOpen deep link to an in-app path (without origin). */
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

/** True when the path must hit the server /auth/callback route (PKCE cookie exchange). */
export function isNativeAuthCallbackPath(pathWithQuery: string): boolean {
  const path = pathWithQuery.split("?")[0]?.split("#")[0] ?? "";
  return path === "/auth/callback" || path === NATIVE_OAUTH_BRIDGE_PATH;
}

/** Normalize bridge path to the server callback route while preserving query/hash. */
export function toNativeAuthCallbackPath(pathWithQuery: string): string {
  if (pathWithQuery.startsWith(NATIVE_OAUTH_BRIDGE_PATH)) {
    return pathWithQuery.replace(NATIVE_OAUTH_BRIDGE_PATH, "/auth/callback");
  }
  return pathWithQuery;
}

export function toAbsoluteNativeAppUrl(pathWithQuery: string): string {
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${NATIVE_APP_ORIGIN}${path}`;
}
