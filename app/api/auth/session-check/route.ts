import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * Lightweight cookie-based session probe for the native OAuth completion path.
 *
 * After native OAuth, the app sets auth cookies and then navigates to a
 * protected route. On iOS, WKWebView commits cookies to its HTTP cookie store
 * asynchronously, so the navigation can race ahead of the cookie and proxy.ts
 * bounces the user to /login. The client polls this endpoint (credentials:
 * "include") until it returns `authenticated: true`, which proves the SERVER
 * sees the session cookie — only then is navigation safe.
 *
 * Lives under /api/, so it is excluded from the proxy.ts matcher and never
 * itself redirects to /login.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        // Read-only probe — no cookie writes needed.
        setAll() {},
      },
    },
  );

  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    authenticated = !error && !!data.user;
  } catch {
    authenticated = false;
  }

  return NextResponse.json({ authenticated }, { headers: NO_STORE });
}
