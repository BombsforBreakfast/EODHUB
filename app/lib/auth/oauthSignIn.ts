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
