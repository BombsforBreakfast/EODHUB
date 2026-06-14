import { supabase } from "../lib/supabaseClient";
import {
  ONBOARDING_GATE_PROFILE_SELECT,
  resolveLoginRedirectPath,
  shouldRedirectToOnboarding,
  type OnboardingGateProfile,
} from "../onboardingGate";
import {
  clearLoginRedirectAttempts,
  consumeOAuthRememberPending,
  markAppSessionActive,
} from "../auth/sessionState";
import {
  isNativeAuthCallbackPath,
  resolveNativeAppUrlOpenTarget,
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

async function resolvePostOAuthDestination(next: string, userId: string): Promise<string> {
  if (next !== "/onboarding") return next;

  const { data: profile } = await supabase
    .from("profiles")
    .select(ONBOARDING_GATE_PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle<OnboardingGateProfile>();

  if (profile && !shouldRedirectToOnboarding(profile)) {
    return resolveLoginRedirectPath(profile);
  }
  return next;
}

/**
 * Complete OAuth in the main Capacitor WebView (PKCE verifier lives here).
 * Returns true when the URL was an auth callback (handled or deduped).
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
  const { code, next } = parseAuthCallbackParams(callbackPath);

  if (!code) {
    console.warn("[nativeOAuth] auth callback missing code");
    window.location.assign("/login?error=auth");
    return true;
  }

  if (wasCodeHandled(code)) {
    console.info("[nativeOAuth] code already exchanged — skipping", code);
    return true;
  }

  markCodeHandled(code);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("[nativeOAuth] exchangeCodeForSession failed", error.message);
    sessionStorage.removeItem(`${HANDLED_CODE_KEY_PREFIX}${code}`);
    window.location.assign("/login?error=auth");
    return true;
  }

  console.info("[nativeOAuth] session established");

  const pendingRemember = consumeOAuthRememberPending();
  markAppSessionActive(pendingRemember ?? true);
  clearLoginRedirectAttempts();

  const { data: { user } } = await supabase.auth.getUser();
  const destination = user
    ? await resolvePostOAuthDestination(next, user.id)
    : next;

  console.info("[nativeOAuth] navigating after login", destination);
  window.location.assign(destination);
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
