import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthRedirectProvider } from "./oauthProviders";
import { isNativeApp } from "../native/isNativeApp";
import { buildNativeOAuthRedirectTo } from "../native/nativeOAuthRedirect";

export function buildOAuthCallbackRedirect(nextPath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export async function signInWithOAuthProvider(
  supabase: SupabaseClient,
  provider: OAuthRedirectProvider,
  options?: {
    nextPath?: string;
    loginHint?: string;
    queryParams?: Record<string, string>;
  },
) {
  const nextPath = options?.nextPath ?? "/onboarding";
  const queryParams = { ...(options?.queryParams ?? {}) };
  if (options?.loginHint?.includes("@") && provider === "google") {
    queryParams.login_hint = options.loginHint;
  }

  if (typeof window !== "undefined" && isNativeApp()) {
    const redirectTo = buildNativeOAuthRedirectTo(nextPath);
    console.info("[oauthSignIn] native OAuth start", { provider, redirectTo, nextPath });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
      },
    });

    if (error) {
      console.warn("[oauthSignIn] native OAuth error", error.message);
      return { data, error };
    }

    if (data?.url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: data.url });
    }
    return { data, error };
  }

  const redirectTo = buildOAuthCallbackRedirect(nextPath);
  console.info("[oauthSignIn] web OAuth start", { provider, redirectTo, nextPath });
  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
    },
  });
}

/**
 * Link an OAuth provider to the currently signed-in account.
 *
 * On native (Capacitor): opens the in-app auth sheet and routes the callback
 * back through the same HTTPS bridge → custom scheme → in-WebView PKCE exchange
 * used by login, so linking never hands off to Safari.
 *
 * On web: standard in-page redirect to the provider.
 */
export async function linkOAuthIdentity(
  supabase: SupabaseClient,
  provider: OAuthRedirectProvider,
  nextPath: string,
) {
  if (typeof window !== "undefined" && isNativeApp()) {
    const redirectTo = buildNativeOAuthRedirectTo(nextPath);
    console.info("[oauthSignIn] native link start", { provider, redirectTo, nextPath });

    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error) {
      console.warn("[oauthSignIn] native link error", error.message);
      return { data, error };
    }

    if (data?.url) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: data.url });
    }
    return { data, error };
  }

  const redirectTo = `${window.location.origin}${nextPath}`;
  console.info("[oauthSignIn] web link start", { provider, redirectTo, nextPath });
  return supabase.auth.linkIdentity({
    provider,
    options: { redirectTo },
  });
}
