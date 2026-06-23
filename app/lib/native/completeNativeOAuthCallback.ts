import type { Session } from "@supabase/supabase-js";
import {
  clearLoginRedirectAttempts,
  clearNativeOAuthCompleting,
  clearNativeOAuthInProgress,
  consumeOAuthRememberPending,
  markAppSessionActive,
  markNativeOAuthCompleting,
} from "../auth/sessionState";
import { oauthDebugLog } from "../auth/oauthDebugLog";
import { supabase } from "../lib/supabaseClient";
import {
  isNativeAuthCallbackPath,
  NATIVE_APP_ORIGIN,
  resolveNativeAppUrlOpenTarget,
  toNativeAuthCallbackPath,
} from "./nativeOAuthRedirect";

// Handled OAuth codes are persisted in localStorage (not sessionStorage) so the
// marker survives the full WebView reload that window.location.assign triggers in
// the Capacitor shell. iOS can cold-launch the app from the OAuth deep link, in
// which case App.getLaunchUrl() returns that same URL on every reload — without a
// durable "already handled" marker the feed re-navigates to itself forever.
const HANDLED_CODES_KEY = "eod_oauth_handled_codes";
const HANDLED_CODE_TTL_MS = 10 * 60 * 1000;

type AuthCallbackParams = {
  code: string | null;
  next: string;
  error: string | null;
  errorDescription: string | null;
  hash: string;
};

function parseAuthCallbackParams(pathWithQuery: string, hash = ""): AuthCallbackParams {
  const parsed = new URL(pathWithQuery, NATIVE_APP_ORIGIN);
  return {
    code: parsed.searchParams.get("code"),
    next: parsed.searchParams.get("next") ?? "/onboarding",
    error: parsed.searchParams.get("error"),
    errorDescription: parsed.searchParams.get("error_description"),
    hash,
  };
}

function hashHasSessionTokens(hash: string): boolean {
  if (!hash || hash === "#") return false;
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(fragment);
  return params.has("access_token") || params.has("refresh_token");
}

function readHandledCodes(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HANDLED_CODES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const pruned: Record<string, number> = {};
    for (const [code, ts] of Object.entries(parsed)) {
      if (typeof ts === "number" && now - ts < HANDLED_CODE_TTL_MS) pruned[code] = ts;
    }
    return pruned;
  } catch {
    return {};
  }
}

function markCodeHandled(code: string) {
  if (typeof window === "undefined") return;
  const codes = readHandledCodes();
  codes[code] = Date.now();
  try {
    window.localStorage.setItem(HANDLED_CODES_KEY, JSON.stringify(codes));
  } catch {
    /* storage unavailable — dedup falls back to the in-flight session check */
  }
}

function wasCodeHandled(code: string): boolean {
  return code in readHandledCodes();
}

/** True when the deep link's OAuth code was already exchanged on a previous load. */
export function isHandledOAuthDeepLink(rawUrl: string): boolean {
  const target = resolveNativeAppUrlOpenTarget(rawUrl);
  if (!target || !isNativeAuthCallbackPath(target)) return false;
  try {
    const hashIndex = target.indexOf("#");
    const pathWithQuery = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const callbackPath = toNativeAuthCallbackPath(pathWithQuery);
    const code = new URL(callbackPath, NATIVE_APP_ORIGIN).searchParams.get("code");
    return code ? wasCodeHandled(code) : false;
  } catch {
    return false;
  }
}

/**
 * Wait for @supabase/ssr to commit auth cookies to the WKWebView network cookie
 * store before navigating. setSession writes via document.cookie, but WKWebView
 * commits asynchronously — navigating too early makes proxy.ts see no cookie and
 * bounce to /login.
 */
async function waitForAuthCookies(maxWaitMs = 1500, intervalMs = 100): Promise<boolean> {
  if (typeof document === "undefined") return true;
  const hasAuthCookie = () =>
    document.cookie.split(";").some((c) => c.trim().includes("-auth-token"));
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (hasAuthCookie()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return hasAuthCookie();
}

function redirectToLoginAuthError(provider?: string) {
  clearNativeOAuthInProgress();
  const query = provider ? `?error=auth&provider=${encodeURIComponent(provider)}` : "?error=auth";
  window.location.assign(`/login${query}`);
}

/** Force @supabase/ssr to write auth cookies before navigating to a protected route. */
async function syncSessionCookies(session: Session): Promise<boolean> {
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return !error && !!data.session?.user;
}

async function resolveNativeOAuthDestination(next: string): Promise<string> {
  // Send both tokens so the route can write the auth cookies via Set-Cookie.
  // Client-side cookies (document.cookie) don't reliably reach WKWebView's HTTP
  // cookie store before the next navigation, which bounces fresh logins to /login.
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  const refreshToken = session?.refresh_token ?? null;
  if (!accessToken) return next;

  try {
    const res = await fetch("/api/auth/oauth-native-complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ next, refresh_token: refreshToken }),
    });
    if (res.ok) {
      const data = (await res.json()) as { destination?: string };
      if (typeof data.destination === "string") return data.destination;
    }
  } catch {
    oauthDebugLog("native_oauth_destination_api_failed", { next });
  }

  return next;
}

async function finishNativeOAuth(next: string): Promise<void> {
  // Keep login-page auto-redirect and blank-WebView recovery from racing this navigation.
  markNativeOAuthCompleting();
  clearNativeOAuthInProgress();
  const destination = await resolveNativeOAuthDestination(next);
  oauthDebugLog("native_oauth_navigate", { destination });
  window.location.assign(destination);
}

/**
 * Complete OAuth in the main Capacitor WebView.
 *
 * PKCE verifier is stored in this WebView when signInWithOAuth starts. Exchange
 * the code here first — server-side exchange often fails on iOS because the
 * verifier cookie does not reliably reach the route handler.
 */
export async function completeNativeOAuthFromDeepLink(
  rawUrl: string,
  closeBrowser: () => Promise<void>,
): Promise<boolean> {
  oauthDebugLog("deep_link_received", { rawUrl: rawUrl.split("?")[0] ?? rawUrl });

  const target = resolveNativeAppUrlOpenTarget(rawUrl);
  if (!target || !isNativeAuthCallbackPath(target)) {
    return false;
  }

  await closeBrowser();

  const hashIndex = target.indexOf("#");
  const pathWithQuery = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : "";

  const callbackPath = toNativeAuthCallbackPath(pathWithQuery);
  const params = parseAuthCallbackParams(callbackPath, hash);

  oauthDebugLog("callback_params", {
    hasCode: !!params.code,
    hasHashTokens: hashHasSessionTokens(params.hash),
    hasError: !!params.error,
    next: params.next,
    code: params.code,
  });

  if (params.error) {
    oauthDebugLog("provider_error", {
      error: params.error,
      errorDescription: params.errorDescription,
    });
    redirectToLoginAuthError("apple");
    return true;
  }

  const pendingRemember = consumeOAuthRememberPending();
  markAppSessionActive(pendingRemember ?? true);
  markNativeOAuthCompleting();

  if (params.code) {
    if (wasCodeHandled(params.code)) {
      oauthDebugLog("code_already_handled", { code: params.code });
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        // Session was already established on the first pass. Do NOT navigate
        // again — re-navigating on a re-delivered launch URL is exactly what
        // turns the post-OAuth landing into an infinite reload loop. Just
        // re-sync cookies, clear the in-flight flags, and let the current page
        // render normally.
        await syncSessionCookies(session);
        clearNativeOAuthInProgress();
        clearNativeOAuthCompleting();
        oauthDebugLog("already_handled_noop", { suppressedNavigation: true });
      } else {
        redirectToLoginAuthError();
      }
      return true;
    }

    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);

    oauthDebugLog("client_exchange", {
      hasSession: !!data.session?.user,
      error: error?.message ?? null,
    });

    if (!error && data.session?.user) {
      markCodeHandled(params.code);
      clearLoginRedirectAttempts();
      const synced = await syncSessionCookies(data.session);
      if (synced) {
        const committed = await waitForAuthCookies();
        oauthDebugLog("auth_cookies_committed", { committed });
      }
      await finishNativeOAuth(params.next);
      return true;
    }

    oauthDebugLog("client_exchange_failed", { error: error?.message ?? null });
    redirectToLoginAuthError();
    return true;
  }

  if (hashHasSessionTokens(params.hash)) {
    oauthDebugLog("hash_token_fallback", { next: params.next });

    const fragment = params.hash.startsWith("#") ? params.hash.slice(1) : params.hash;
    const hashParams = new URLSearchParams(fragment);
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      oauthDebugLog("hash_fallback_setSession", {
        hasSession: !!data.session?.user,
        error: error?.message ?? null,
      });

      if (data.session?.user) {
        clearLoginRedirectAttempts();
        const synced = await syncSessionCookies(data.session);
        if (synced) {
          const committed = await waitForAuthCookies();
          oauthDebugLog("auth_cookies_committed", { committed, source: "hash" });
        }
        await finishNativeOAuth(params.next);
      } else {
        redirectToLoginAuthError();
      }
      return true;
    }

    oauthDebugLog("hash_fallback_missing_tokens", {});
    redirectToLoginAuthError();
    return true;
  }

  oauthDebugLog("callback_missing_code", {});
  redirectToLoginAuthError();
  return true;
}

export type NativeDeepLinkHandlers = {
  closeBrowser: () => Promise<void>;
  clientRoute: (path: string) => void;
};

/** Non-auth deep links (notifications, etc.). */
export async function handleNativeDeepLink(
  rawUrl: string,
  handlers: NativeDeepLinkHandlers,
): Promise<void> {
  const handled = await completeNativeOAuthFromDeepLink(rawUrl, handlers.closeBrowser);
  if (handled) return;

  const target = resolveNativeAppUrlOpenTarget(rawUrl);
  if (!target) {
    oauthDebugLog("unrecognized_deep_link", { rawUrl: rawUrl.split("?")[0] ?? rawUrl });
    return;
  }

  oauthDebugLog("client_route", { target: target.split("?")[0] ?? target });
  handlers.clientRoute(target);
}
