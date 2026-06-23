import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import {
  ONBOARDING_GATE_PROFILE_SELECT,
  resolveLoginRedirectPath,
  shouldRedirectToOnboarding,
  type OnboardingGateProfile,
} from "@/app/lib/onboardingGate";
import { clearFailedAuthReportsOnSuccessfulLogin } from "@/app/lib/server/clearFailedAuthReportsOnLogin";
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";
import { collectUserOAuthProviders, resolveAuthUserEmail } from "@/app/lib/auth/oauthProviders";

function truncateCode(code: string | null): string | null {
  if (!code) return null;
  return code.length <= 8 ? `${code.slice(0, 4)}…` : `${code.slice(0, 4)}…(${code.length})`;
}

/**
 * Server-side OAuth callback handler (Supabase PKCE flow).
 *
 * Supabase redirects here with ?code=... after OAuth (Google, Apple, etc.) completes.
 * We exchange the code for a session server-side so the auth cookies are
 * set on the redirect response — the middleware sees a valid session on
 * the very next request and won't redirect back to /login.
 *
 * The session is authoritative here, so we also resolve the user's final
 * destination server-side (onboarding vs / vs /verify-email vs /pending)
 * using the same routing logic as the login page. This avoids sending every
 * OAuth user through /onboarding only to have the client re-route them — a
 * client-side gate that can race cookie hydration and bounce the first login
 * attempt back to /login.
 *
 * Usage: set redirectTo to `${origin}/auth/callback?next=/onboarding`
 * (or any other destination).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  // Where to send the user after successful auth (defaults to onboarding).
  const next = searchParams.get("next") ?? "/onboarding";

  console.info("[oauth] server_callback", {
    pathname,
    hasCode: !!code,
    hasError: !!oauthError,
    error: oauthError,
    errorDescription: oauthErrorDescription,
    code: truncateCode(code),
    next,
  });

  if (oauthError && !code) {
    void logFailedAuthAttempt({
      failureReason: "SERVER_ERROR",
      errorCode: "oauth_provider_error",
      rawErrorMessage: oauthErrorDescription ?? oauthError,
      sourceRoute: "/auth/callback",
      request,
    });
    const provider = oauthError.includes("apple") ? "apple" : undefined;
    const loginUrl = provider
      ? `${origin}/login?error=auth&provider=${provider}`
      : `${origin}/login?error=auth`;
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    // Collect the session cookies emitted during the code exchange so we can
    // attach them to whichever redirect response we ultimately build (the
    // destination isn't known until the profile is resolved below).
    const cookiesToApply: { name: string; value: string; options: Record<string, unknown> }[] = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach((cookie) => {
              cookiesToApply.push(cookie as (typeof cookiesToApply)[number]);
            });
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const providers = collectUserOAuthProviders(sessionData.user ?? {});
      console.info("[oauth] exchange_success", {
        userId: sessionData.user?.id ?? null,
        providers: providers.join(",") || null,
        cookieCount: cookiesToApply.length,
      });

      // Default to the requested `next` (preserves ?ref= and the business-org
      // flow). Only fully-onboarded users get routed past /onboarding below.
      let destination = next;

      const { client: adminClient } = createSupabaseServiceRoleClient();
      if (adminClient) {
        const userId = sessionData.user?.id;
        let oauthEmail = resolveAuthUserEmail(sessionData.user);
        if (userId && !oauthEmail) {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          oauthEmail = resolveAuthUserEmail(authUser?.user ?? null);
        }
        if (userId && oauthEmail) {
          const stub = await ensureProfileStubForUser(adminClient, userId, oauthEmail);
          if (!stub.ok) {
            void logFailedAuthAttempt({
              emailAttempted: oauthEmail,
              failureReason: "PROFILE_CREATION_FAILED",
              errorCode: "ensure_profile_stub_failed",
              rawErrorMessage: stub.error,
              sourceRoute: "/auth/callback",
              request,
            });
            return NextResponse.redirect(`${origin}/login?error=auth`);
          }

          const nextUrl = new URL(next, origin);
          if (nextUrl.pathname === "/business-org/onboarding" && nextUrl.searchParams.get("business_oauth") === "google") {
            await adminClient.auth.admin.updateUserById(userId, {
              app_metadata: {
                ...(sessionData.user.app_metadata ?? {}),
                account_kind: "business_organization_page",
              },
            });
          } else if (nextUrl.pathname === "/onboarding") {
            // Standard login/signup path: resolve the real destination from the
            // profile so already-onboarded users skip /onboarding entirely.
            const { data: profile } = await adminClient
              .from("profiles")
              .select(ONBOARDING_GATE_PROFILE_SELECT)
              .eq("user_id", userId)
              .maybeSingle<OnboardingGateProfile>();
            if (profile && !shouldRedirectToOnboarding(profile)) {
              destination = resolveLoginRedirectPath(profile);
            }
          }
        }
        void clearFailedAuthReportsOnSuccessfulLogin(adminClient, oauthEmail);
      }

      console.info("[oauth] redirect_destination", { destination });

      // Build the redirect to the resolved destination and attach the session
      // cookies so they arrive in the browser before the next page load.
      const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
      cookiesToApply.forEach(({ name, value, options }) => {
        redirectResponse.cookies.set(name, value, options);
      });
      return redirectResponse;
    }

    console.info("[oauth] exchange_failed", { message: error.message });
    void logFailedAuthAttempt({
      failureReason: "SERVER_ERROR",
      errorCode: "oauth_exchange_failed",
      rawErrorMessage: error.message,
      sourceRoute: "/auth/callback",
      request,
    });
  } else {
    void logFailedAuthAttempt({
      failureReason: "SERVER_ERROR",
      errorCode: "oauth_missing_code",
      sourceRoute: "/auth/callback",
      request,
    });
  }

  // Code missing or exchange failed — send back to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
