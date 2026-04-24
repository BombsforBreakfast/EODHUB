import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side OAuth callback handler (Supabase PKCE flow).
 *
 * Supabase redirects here with ?code=... after Google auth completes.
 * We exchange the code for a session server-side so the auth cookies are
 * set on the redirect response — the middleware sees a valid session on
 * the very next request and won't redirect back to /login.
 *
 * Usage: set redirectTo to `${origin}/auth/callback?next=/onboarding`
 * (or any other destination).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Where to send the user after successful auth (defaults to onboarding).
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    // Pre-build the redirect response so we can attach cookies to it.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Write session cookies directly onto the redirect response so
            // they arrive in the browser before the next page load.
            cookiesToSet.forEach(({ name, value, options }) => {
              redirectResponse.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  // Code missing or exchange failed — send back to login with an error flag.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
