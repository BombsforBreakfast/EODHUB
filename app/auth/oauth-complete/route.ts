import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { resolveOAuthPostAuthDestination } from "@/app/lib/server/oauthPostAuthRedirect";
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";

/**
 * Native OAuth completion — session already established in the WebView via
 * client-side exchangeCodeForSession (PKCE verifier lives in the WebView).
 * Ensures profile stub + resolves feed vs onboarding destination.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/onboarding";

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          /* read-only — session cookies were set by the client exchange */
        },
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  console.info("[oauth] oauth_complete", {
    hasUser: !!user,
    userError: userError?.message ?? null,
    next,
  });

  if (!user) {
    void logFailedAuthAttempt({
      failureReason: "SERVER_ERROR",
      errorCode: "oauth_complete_no_session",
      rawErrorMessage: userError?.message ?? "no user after client exchange",
      sourceRoute: "/auth/oauth-complete",
      request,
    });
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  const { client: adminClient } = createSupabaseServiceRoleClient();
  if (!adminClient) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const { destination, oauthEmail, profileError } = await resolveOAuthPostAuthDestination(
    adminClient,
    user,
    next,
    origin,
  );

  if (profileError) {
    void logFailedAuthAttempt({
      emailAttempted: oauthEmail,
      failureReason: "PROFILE_CREATION_FAILED",
      errorCode: "ensure_profile_stub_failed",
      rawErrorMessage: profileError,
      sourceRoute: "/auth/oauth-complete",
      request,
    });
    return NextResponse.redirect(`${origin}/login?error=auth`);
  }

  console.info("[oauth] oauth_complete_redirect", { destination, userId: user.id });
  return NextResponse.redirect(`${origin}${destination}`);
}
