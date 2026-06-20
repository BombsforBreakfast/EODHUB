import {
  clearLoginRedirectAttempts,
  consumeOAuthRememberPending,
  markAppSessionActive,
} from "../auth/sessionState";
import {
  isNativeAuthCallbackPath,
  resolveNativeAppUrlOpenTarget,
  toAbsoluteNativeAppUrl,
  toNativeAuthCallbackPath,
} from "./nativeOAuthRedirect";

const HANDLED_CODE_KEY_PREFIX = "eod_oauth_handled_";

function parseAuthCallbackParams(pathWithQuery: string): { code: string | null; next: string } {
  const parsed = new URL(pathWithQuery, "https://eod-hub.com");
  return {
    code: parsed.searchParams.get("code"),
    next: parsed.searchParams.get("next") ?? "/onboarding",
  };
}

function markCodeHandled(code: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(`${HANDLED_CODE_KEY_PREFIX}${code}`, "1");
}

function wasCodeHandled(code: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(`${HANDLED_CODE_KEY_PREFIX}${code}`) === "1";
}

/**
 * Complete OAuth in the main Capacitor WebView.
 *
 * The PKCE verifier is stored in this WebView's cookies when signInWithOAuth
 * starts. We hand the auth code to the server /auth/callback route so session
 * cookies are set atomically on the redirect response. Client-side
 * exchangeCodeForSession raced cookie writes and bounced new signups to /login
 * (especially on iPad native shells).
 */
export async function completeNativeOAuthFromDeepLink(
  rawUrl: string,
  closeBrowser: () => Promise<void>,
): Promise<boolean> {
  console.info("[nativeOAuth] deep link", rawUrl);

  const target = resolveNativeAppUrlOpenTarget(rawUrl);
  if (!target || !isNativeAuthCallbackPath(target)) {
    return false;
  }

  await closeBrowser();

  const callbackPath = toNativeAuthCallbackPath(target);
  const { code } = parseAuthCallbackParams(callbackPath);

  if (!code) {
    console.warn("[nativeOAuth] auth callback missing code");
    window.location.assign("/login?error=auth");
    return true;
  }

  if (wasCodeHandled(code)) {
    console.info("[nativeOAuth] code already handled — skipping", code);
    return true;
  }

  markCodeHandled(code);

  const pendingRemember = consumeOAuthRememberPending();
  markAppSessionActive(pendingRemember ?? true);
  clearLoginRedirectAttempts();

  const serverCallbackUrl = toAbsoluteNativeAppUrl(callbackPath);
  console.info("[nativeOAuth] navigating to server callback", serverCallbackUrl);
  window.location.assign(serverCallbackUrl);
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
    console.warn("[nativeOAuth] unrecognized deep link", rawUrl);
    return;
  }

  console.info("[nativeOAuth] client route", target);
  handlers.clientRoute(target);
}
