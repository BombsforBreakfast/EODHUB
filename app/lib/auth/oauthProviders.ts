import type { Provider, User } from "@supabase/supabase-js";

/** OAuth providers whose email is trusted to skip the Resend verification step. */
export const TRUSTED_OAUTH_PROVIDERS = ["google", "apple"] as const;

export type TrustedOAuthProvider = (typeof TRUSTED_OAUTH_PROVIDERS)[number];

export function isTrustedOAuthProvider(provider: string): provider is TrustedOAuthProvider {
  return (TRUSTED_OAUTH_PROVIDERS as readonly string[]).includes(provider);
}

export function formatOAuthProviderLabel(provider: string): string {
  if (provider === "email") return "Email & password";
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function collectUserOAuthProviders(user: {
  app_metadata?: { provider?: string };
  identities?: { provider?: string }[] | null;
}): string[] {
  const fromIdentities = (user.identities ?? [])
    .map((i) => i.provider)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (fromIdentities.length > 0) {
    return [...new Set(fromIdentities)];
  }
  const single = user.app_metadata?.provider;
  return single ? [single] : [];
}

/** Single trusted OAuth identity (no email/password) — skips Resend email verify after onboarding. */
export function isOAuthOnlyTrustedProvider(user: {
  app_metadata?: { provider?: string };
  identities?: { provider?: string }[] | null;
}): boolean {
  const providers = collectUserOAuthProviders(user).filter((p) => p !== "email");
  return providers.length === 1 && isTrustedOAuthProvider(providers[0]!);
}

export function resolveAuthUserEmail(user: User | null | undefined): string | null {
  if (!user) return null;
  const direct = user.email?.trim();
  if (direct) return direct;
  const metaEmail = user.user_metadata?.email;
  if (typeof metaEmail === "string" && metaEmail.trim()) return metaEmail.trim();
  return null;
}

export type OAuthRedirectProvider = Extract<Provider, "google" | "apple">;
