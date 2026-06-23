import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResolveAction = "delete_job" | "dismiss";

const ALLOWED_ACTIONS: ResolveAction[] = ["delete_job", "dismiss"];

/**
 * POST /api/admin/jobs/stale-flags/resolve
 *
 * Body: { jobId: string; action: 'delete_job' | 'dismiss'; notes?: string }
 *
 *  - delete_job: permanently deletes the job row (and cascaded stale flags).
 *  - dismiss: closes all open flags for that job as 'dismissed' but leaves
 *    the listing live (e.g. admin clicked the link and it works).
 */
import { deleteJobPermanently } from "@/app/lib/server/deleteJobPermanently";
export async function POST(req: NextRequest) {
  const authHeader =
    req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 503 },
    );
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { jobId?: unknown; action?: unknown; notes?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const action = typeof body.action === "string" ? (body.action as ResolveAction) : "" as ResolveAction;
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim().slice(0, 500)
      : null;

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const newFlagStatus = action === "delete_job" ? "job_deleted" : "dismissed";
  const now = new Date().toISOString();

  if (action === "delete_job") {
    const { count: openFlagCount } = await adminClient
      .from("job_stale_flags")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .eq("status", "open");

    const result = await deleteJobPermanently(adminClient, jobId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      action,
      resolvedCount: openFlagCount ?? 0,
    });
  }

  const { data: updated, error: flagErr } = await adminClient
    .from("job_stale_flags")
    .update({
      status: newFlagStatus,
      resolved_at: now,
      resolved_by: user.id,
      resolution_notes: notes,
    })
    .eq("job_id", jobId)
    .eq("status", "open")
    .select("id");

  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    action,
    resolvedCount: updated?.length ?? 0,
  });
}
