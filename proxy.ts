import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Paths that are accessible without a session.
 * Everything else redirects to /login when the user is not authenticated.
 */
function isPublicPath(pathname: string) {
  const publicRoutes = ["/login", "/reset-password", "/terms", "/privacy", "/guidelines", "/auth/callback"];
  return publicRoutes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
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

  const path = request.nextUrl.pathname;
  if (!isPublicPath(path) && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all page routes except Next internals, API routes, and static assets.
     * (API routes perform their own auth; assets do not need session refresh.)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
