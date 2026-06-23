import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { resolveOAuthPostAuthDestination } from "@/app/lib/server/oauthPostAuthRedirect";

/**
 * Native OAuth post-exchange — profile stub + destination resolution.
 * Authenticates via Bearer token (client session) instead of cookies.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let next = "/onboarding";
  try {
    const body = (await req.json()) as { next?: unknown };
    if (typeof body.next === "string" && body.next.startsWith("/")) {
      next = body.next;
    }
  } catch {
    /* empty body is fine */
  }

  const origin = new URL(req.url).origin;
  const { client: adminClient, error: adminError } = createSupabaseServiceRoleClient();

  if (adminError || !adminClient) {
    return NextResponse.json({ destination: next });
  }

  const { destination, profileError } = await resolveOAuthPostAuthDestination(
    adminClient,
    user,
    next,
    origin,
  );

  if (profileError) {
    return NextResponse.json({ error: "profile_creation_failed" }, { status: 500 });
  }

  return NextResponse.json({ destination });
}
