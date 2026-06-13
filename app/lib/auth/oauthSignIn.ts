import type { SupabaseClient } from "@supabase/supabase-js";
import type { OAuthRedirectProvider } from "./oauthProviders";

export function buildOAuthCallbackRedirect(nextPath: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

export function signInWithOAuthProvider(
  supabase: SupabaseClient,
  provider: OAuthRedirectProvider,
  options?: {
    nextPath?: string;
    loginHint?: string;
    queryParams?: Record<string, string>;
  },
) {
  const nextPath = options?.nextPath ?? "/onboarding";
  const redirectTo = buildOAuthCallbackRedirect(nextPath);
  const queryParams = { ...(options?.queryParams ?? {}) };
  if (options?.loginHint?.includes("@") && provider === "google") {
    queryParams.login_hint = options.loginHint;
  }

  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      ...(Object.keys(queryParams).length > 0 ? { queryParams } : {}),
    },
  });
}
