import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getRequestCountryCode, isDeniedGeoCountry } from "@/app/lib/geoAccess";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Paths that are accessible without a session.
 * Everything else redirects to /login when the user is not authenticated.
 */
function isPublicPath(pathname: string) {
  const publicRoutes = [
    "/login",
    "/reset-password",
    "/terms",
    "/privacy",
    "/support",
    "/guidelines",
    "/auth/callback",
    "/auth/app-callback",
    "/business-org",
    "/business-org/onboarding",
    "/email-verified",
    "/unavailable",
  ];
  return publicRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Server-to-server routes that must not be geo-blocked (cron / webhooks). */
function isGeoExemptPath(pathname: string) {
  return (
    pathname.startsWith("/api/cron/") ||
    pathname.startsWith("/api/stripe/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/admin-pending-alert" ||
    pathname.startsWith("/api/import-")
  );
}

/** Supabase auth cookies — skip network auth when none are present. */
function hasSupabaseAuthCookies(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
}

function geoBlockResponse(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Not available in your region." },
      { status: 403 },
    );
  }
  const unavailable = new URL("/unavailable", request.url);
  return NextResponse.rewrite(unavailable);
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Geo hard-block first (before auth). Fail open when country header is missing (local/dev).
  if (!isGeoExemptPath(path) && path !== "/unavailable") {
    const country = getRequestCountryCode(request.headers);
    if (isDeniedGeoCountry(country)) {
      return geoBlockResponse(request);
    }
  }

  // API routes handle their own auth; after geo check, pass through.
  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  if (isPublicPath(path)) {
    return NextResponse.next();
  }

  if (!hasSupabaseAuthCookies(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // If the auth check itself throws, fail open on public paths and
    // redirect to login for protected paths rather than crashing the request.
  }

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on pages and API routes — skip Next internals and static assets.
     * Geo-block applies to both; API auth remains route-owned after the geo check.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|map|txt|json|webmanifest)$).*)",
  ],
};
