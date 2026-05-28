import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hasFullPlatformAccess } from "@/app/lib/verificationAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_REASONS = new Set([
  "dead_link",
  "expired",
  "position_filled",
  "incorrect_info",
  "other",
]);

const MAX_NOTES_LENGTH = 500;

/**
 * Authenticated user reports a job as stale (dead link / expired / etc).
 *
 * Idempotent per (job_id, reporter_id): subsequent reports update reason/notes
 * and reopen a previously-dismissed flag. Only fully verified users can file
 * reports — keeps the admin queue free of unverified-account spam.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id: jobId } = await ctx.params;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select(
      "email_verified, admin_verified, verification_status, is_pure_admin",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || !hasFullPlatformAccess(profile)) {
    return NextResponse.json(
      { error: "Only verified members can report stale jobs." },
      { status: 403 },
    );
  }

  let body: { reason?: unknown; notes?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!ALLOWED_REASONS.has(reason)) {
    return NextResponse.json(
      { error: "Invalid reason." },
      { status: 400 },
    );
  }

  let notes: string | null = null;
  if (typeof body.notes === "string") {
    const trimmed = body.notes.trim();
    if (trimmed.length > 0) {
      notes = trimmed.slice(0, MAX_NOTES_LENGTH);
    }
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // Confirm the job exists + isn't already rejected (no point flagging a
  // listing the admin already deleted).
  const { data: job, error: jobErr } = await adminClient
    .from("jobs")
    .select("id, is_rejected")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }
  if (!job || job.is_rejected) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // Upsert through service role: keeps RLS simple (members only need INSERT
  // policy) and lets us flip a previously-dismissed flag back to "open".
  const { error: upsertErr } = await adminClient
    .from("job_stale_flags")
    .upsert(
      {
        job_id: jobId,
        reporter_id: user.id,
        reason,
        notes,
        status: "open",
        resolved_at: null,
        resolved_by: null,
        resolution_notes: null,
      },
      { onConflict: "job_id,reporter_id" },
    );

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
