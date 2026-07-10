import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { resolveOAuthPostAuthDestination } from "@/app/lib/server/oauthPostAuthRedirect";
import { resolveClaimedOAuthSessionUser } from "@/app/lib/server/claimPendingOAuthLoginAlias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieToApply = { name: string; value: string; options: Record<string, unknown> };

/**
 * Native OAuth post-exchange — sets auth cookies + resolves the destination.
 *
 * The native deep-link handler exchanges the PKCE code client-side, which writes
 * the session to localStorage and document.cookie. In WKWebView, document.cookie
 * writes do NOT reliably reach the HTTP cookie store used by the next top-level
 * navigation, so the first navigation to a protected route races ahead without
 * the auth cookie and proxy.ts bounces the user to /login (only the second
 * attempt works, once the cookie has finally committed).
 *
 * Setting the cookies here via a server Set-Cookie response fixes that: WKWebView
 * reliably commits Set-Cookie from this same-origin fetch before the client
 * navigates, so proxy.ts sees a valid session on the first protected request.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const accessToken = authHeader.slice(7);

  let next = "/onboarding";
  let refreshToken: string | null = null;
  try {
    const body = (await req.json()) as { next?: unknown; refresh_token?: unknown };
    if (typeof body.next === "string" && body.next.startsWith("/")) {
      next = body.next;
    }
    if (typeof body.refresh_token === "string") {
      refreshToken = body.refresh_token;
    }
  } catch {
    /* empty body is fine */
  }

  // Collect cookies emitted by setSession so they can be returned as Set-Cookie.
  const cookiesToApply: CookieToApply[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(list) {
          list.forEach((cookie) => cookiesToApply.push(cookie as CookieToApply));
        },
      },
    },
  );

  // Prefer setSession (emits the auth cookies). Fall back to bearer-token-only
  // verification when no refresh token was provided.
  if (refreshToken) {
    await supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .catch(() => {});
  }

  let user = (await supabase.auth.getUser()).data.user;
  if (!user) {
    user = (await supabase.auth.getUser(accessToken)).data.user;
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const { client: adminClient, error: adminError } = createSupabaseServiceRoleClient();

  let activeUser = user;
  if (!adminError && adminClient) {
    const claimed = await resolveClaimedOAuthSessionUser(supabase, adminClient, user);
    if (claimed.claimError) {
      const errorRes = NextResponse.json({ error: "oauth_alias_claim_failed" }, { status: 500 });
      applyCookies(errorRes, cookiesToApply);
      return errorRes;
    }
    activeUser = claimed.user;
  }

  let destination = next;
  if (!adminError && adminClient) {
    const { destination: resolved, profileError } = await resolveOAuthPostAuthDestination(
      adminClient,
      activeUser,
      next,
      origin,
    );
    if (profileError) {
      const errorRes = NextResponse.json({ error: "profile_creation_failed" }, { status: 500 });
      applyCookies(errorRes, cookiesToApply);
      return errorRes;
    }
    destination = resolved;
  }

  const res = NextResponse.json({ destination });
  applyCookies(res, cookiesToApply);
  return res;
}

function applyCookies(res: NextResponse, cookies: CookieToApply[]) {
  cookies.forEach(({ name, value, options }) => {
    res.cookies.set(name, value, options);
  });
}
