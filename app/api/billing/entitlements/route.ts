import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveEntitlements } from "../../../lib/billing/resolveEntitlements";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/entitlements
 * Authoritative member entitlement state for web and native clients.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } } },
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await db
    .from("profiles")
    .select("account_type, subscription_status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const resolved = await resolveEntitlements(db, {
    userId: user.id,
    accountType: profile?.account_type ?? null,
    subscriptionStatus: profile?.subscription_status ?? null,
    authUserCreatedAtIso: user.created_at ?? null,
    isAdmin: profile?.is_admin ?? false,
  });

  return NextResponse.json({
    entitlements: {
      eodhub_member: resolved.eodhubMember,
    },
    sources: resolved.sources,
  });
}
