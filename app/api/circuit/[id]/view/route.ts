import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCollapsingCircuitEnabled } from "../../../../lib/circuit";
import { hasFullPlatformAccess, type VerificationProfile } from "../../../../lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { data: post } = await admin
    .from("circuit_posts")
    .select("id")
    .eq("id", id)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error } = await admin.from("circuit_views").upsert(
    { user_id: user.id, post_id: id, seen_at: nowIso },
    { onConflict: "user_id,post_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
