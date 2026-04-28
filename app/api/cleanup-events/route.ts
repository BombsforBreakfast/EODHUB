import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logSecurityAuditEvent } from "@/app/lib/securityAuditServer";

// Deletes calendar events whose date has passed. Memorials are in a separate
// table and are never touched here.
export async function POST(req: NextRequest) {
  const routePath = "/api/cleanup-events";
  const cronSecret = process.env.CRON_SECRET;
  const secretHeader = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  const cronAuthorized = !!cronSecret && !!secretHeader && secretHeader === cronSecret;

  if (!cronAuthorized) {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await logSecurityAuditEvent({
        route: routePath,
        action: "cleanup_expired_events",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "missing_bearer_or_cron_secret" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      await logSecurityAuditEvent({
        route: routePath,
        action: "cleanup_expired_events",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "invalid_session" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.is_admin) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "cleanup_expired_events",
        outcome: "deny",
        httpStatus: 403,
        metadata: { reason: "not_admin" },
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Use service role to bypass RLS and delete any expired event
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { error, count } = await adminClient
    .from("events")
    .delete({ count: "exact" })
    .lt("date", today)
    .is("unit_id", null)
    .eq("visibility", "public");

  if (error) {
    console.error("cleanup-events error:", error);
    await logSecurityAuditEvent({
      route: routePath,
      action: "cleanup_expired_events",
      outcome: "error",
      httpStatus: 500,
      metadata: { reason: "delete_failed", message: error.message, cronAuthorized },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logSecurityAuditEvent({
    route: routePath,
    action: "cleanup_expired_events",
    outcome: "allow",
    httpStatus: 200,
    metadata: { deletedCount: count ?? 0, cronAuthorized },
  });

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
