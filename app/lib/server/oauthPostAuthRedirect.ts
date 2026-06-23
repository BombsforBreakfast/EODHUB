import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import {
  ONBOARDING_GATE_PROFILE_SELECT,
  resolveLoginRedirectPath,
  shouldRedirectToOnboarding,
  type OnboardingGateProfile,
} from "@/app/lib/onboardingGate";
import { resolveAuthUserEmail } from "@/app/lib/auth/oauthProviders";
import { clearFailedAuthReportsOnSuccessfulLogin } from "@/app/lib/server/clearFailedAuthReportsOnLogin";

/**
 * Shared post-OAuth routing after the session exists (client or server exchange).
 */
export async function resolveOAuthPostAuthDestination(
  adminClient: SupabaseClient,
  user: User,
  next: string,
  origin: string,
): Promise<{ destination: string; oauthEmail: string | null; profileError: string | null }> {
  let destination = next;
  let oauthEmail = resolveAuthUserEmail(user);

  if (!oauthEmail) {
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id);
    oauthEmail = resolveAuthUserEmail(authUser?.user ?? null);
  }

  if (oauthEmail) {
    const stub = await ensureProfileStubForUser(adminClient, user.id, oauthEmail);
    if (!stub.ok) {
      return { destination, oauthEmail, profileError: stub.error };
    }

    const nextUrl = new URL(next, origin);
    if (
      nextUrl.pathname === "/business-org/onboarding" &&
      nextUrl.searchParams.get("business_oauth") === "google"
    ) {
      await adminClient.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...(user.app_metadata ?? {}),
          account_kind: "business_organization_page",
        },
      });
    } else if (nextUrl.pathname === "/onboarding") {
      const { data: profile } = await adminClient
        .from("profiles")
        .select(ONBOARDING_GATE_PROFILE_SELECT)
        .eq("user_id", user.id)
        .maybeSingle<OnboardingGateProfile>();
      if (profile && !shouldRedirectToOnboarding(profile)) {
        destination = resolveLoginRedirectPath(profile);
      }
    }
  }

  void clearFailedAuthReportsOnSuccessfulLogin(adminClient, oauthEmail);
  return { destination, oauthEmail, profileError: null };
}
