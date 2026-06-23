import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  collectUserOAuthProviders,
} from "@/app/lib/auth/oauthProviders";
import { resolveOAuthPostAuthDestination } from "@/app/lib/server/oauthPostAuthRedirect";
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";

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
 * Native Capacitor apps prefer client-side exchange in the main WebView; this
 * route remains the web browser path and a fallback when the verifier cookie
 * reaches the server.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
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
      },
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && sessionData.user) {
      const providers = collectUserOAuthProviders(sessionData.user);
      console.info("[oauth] exchange_success", {
        userId: sessionData.user.id,
        providers: providers.join(",") || null,
        cookieCount: cookiesToApply.length,
      });

      const { client: adminClient } = createSupabaseServiceRoleClient();
      let destination = next;

      if (adminClient) {
        const { destination: resolved, oauthEmail, profileError } =
          await resolveOAuthPostAuthDestination(
            adminClient,
            sessionData.user,
            next,
            origin,
          );

        if (profileError) {
          void logFailedAuthAttempt({
            emailAttempted: oauthEmail,
            failureReason: "PROFILE_CREATION_FAILED",
            errorCode: "ensure_profile_stub_failed",
            rawErrorMessage: profileError,
            sourceRoute: "/auth/callback",
            request,
          });
          return NextResponse.redirect(`${origin}/login?error=auth`);
        }

        destination = resolved;
      }

      console.info("[oauth] redirect_destination", { destination });

      const redirectResponse = NextResponse.redirect(`${origin}${destination}`);
      cookiesToApply.forEach(({ name, value, options }) => {
        redirectResponse.cookies.set(name, value, options);
      });
      return redirectResponse;
    }

    console.info("[oauth] exchange_failed", { message: error?.message ?? "no user" });
    void logFailedAuthAttempt({
      failureReason: "SERVER_ERROR",
      errorCode: "oauth_exchange_failed",
      rawErrorMessage: error?.message ?? "exchange returned no user",
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

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
