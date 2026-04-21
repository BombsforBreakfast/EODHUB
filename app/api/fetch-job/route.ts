import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractMetadata } from "@/app/lib/metadata/extractMetadata";
import { logSecurityAuditEvent } from "@/app/lib/securityAuditServer";

export async function POST(req: NextRequest) {
  const routePath = "/api/fetch-job";
  try {
    // Require a logged-in user
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await logSecurityAuditEvent({
        route: routePath,
        action: "fetch_job_metadata",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "missing_bearer" },
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
        action: "fetch_job_metadata",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "invalid_session" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId, websiteUrl } = await req.json();

    if (!jobId || !websiteUrl) {
      return NextResponse.json(
        { error: "Missing jobId or websiteUrl" },
        { status: 400 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    const isAdmin = !!profile?.is_admin;

    const { data: jobRow, error: jobLookupError } = await adminClient
      .from("jobs")
      .select("id, user_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobLookupError) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_job_metadata",
        outcome: "error",
        httpStatus: 500,
        metadata: { reason: "job_lookup_failed", jobId, message: jobLookupError.message },
      });
      return NextResponse.json({ error: jobLookupError.message }, { status: 500 });
    }
    if (!jobRow) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_job_metadata",
        outcome: "deny",
        httpStatus: 404,
        metadata: { reason: "job_not_found", jobId },
      });
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!isAdmin && jobRow.user_id !== user.id) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_job_metadata",
        outcome: "deny",
        httpStatus: 403,
        metadata: { reason: "forbidden", jobId, ownerUserId: jobRow.user_id },
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metadata = await extractMetadata(websiteUrl);

    const { error } = await adminClient
      .from("jobs")
      .update({
        og_title: metadata.title,
        og_description: metadata.description,
        og_image: metadata.image,
        og_site_name: metadata.siteName,
      })
      .eq("id", jobId);

    if (error) {
      console.error("Supabase update error:", error);
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_job_metadata",
        outcome: "error",
        httpStatus: 500,
        metadata: { reason: "update_failed", jobId, message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSecurityAuditEvent({
      actorUserId: user.id,
      route: routePath,
      action: "fetch_job_metadata",
      outcome: "allow",
      httpStatus: 200,
      metadata: { jobId, isAdmin },
    });

    return NextResponse.json({
      success: true,
      og_title: metadata.title,
      og_description: metadata.description,
      og_image: metadata.image,
      og_site_name: metadata.siteName,
      url: metadata.url,
    });
  } catch (error) {
    console.error("fetch-job route error:", error);
    await logSecurityAuditEvent({
      route: routePath,
      action: "fetch_job_metadata",
      outcome: "error",
      httpStatus: 500,
      metadata: { reason: "exception", message: error instanceof Error ? error.message : "unknown" },
    });

    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}