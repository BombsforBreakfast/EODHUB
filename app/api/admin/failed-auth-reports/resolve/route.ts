import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import {
  dismissFailedAuthReports,
  provisionUserAccessFromFailedAuth,
} from "@/app/lib/server/provisionUserAccessFromFailedAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin actions on failed_auth_reports.
 *
 * Accepts either a single `reportId` or `normalizedEmail` (batch). The
 * standalone override_block surface is intentionally not exposed — the
 * unified "Approve & email temp password" flow handles the rate-limit
 * bypass internally when it creates the auth user.
 */

type ResolveAction = "provision_temp_password" | "dismiss";

const VALID_ACTIONS = new Set<ResolveAction>([
  "provision_temp_password",
  "dismiss",
]);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
    }

    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: authData } = await userClient.auth.getUser();
    const caller = authData?.user;
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminProfile } = await userClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
      reportId?: unknown;
      normalizedEmail?: unknown;
      action?: unknown;
      notes?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.reportId === "string" ? body.reportId.trim() : "";
    const rawNormalizedEmail =
      typeof body.normalizedEmail === "string" ? body.normalizedEmail.trim() : "";
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    if (!reportId && !rawNormalizedEmail) {
      return NextResponse.json(
        { error: "reportId or normalizedEmail required" },
        { status: 400 },
      );
    }
    if (!VALID_ACTIONS.has(action as ResolveAction)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Resolve the working email + ipAddress from either the explicit
    // normalizedEmail (batch path) or the single report (legacy path).
    let normalizedEmail = rawNormalizedEmail ? normalizeEmail(rawNormalizedEmail) : "";
    let ipAddress: string | null = null;

    if (reportId) {
      const { data: report, error: reportError } = await adminClient
        .from("failed_auth_reports")
        .select("id, email_attempted, normalized_email, ip_address, admin_decision")
        .eq("id", reportId)
        .maybeSingle();

      if (reportError || !report) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      if (report.admin_decision) {
        return NextResponse.json(
          { error: `Report already resolved (${report.admin_decision})` },
          { status: 409 },
        );
      }

      if (!normalizedEmail) {
        const raw =
          (report.normalized_email as string | null) ??
          (report.email_attempted as string | null) ??
          "";
        normalizedEmail = normalizeEmail(raw);
      }
      ipAddress = (report.ip_address as string | null) ?? null;
    }

    devAuthLog("failed-auth-resolve", {
      step: "request",
      adminId: caller.id,
      reportId: reportId || undefined,
      normalizedEmail: normalizedEmail || undefined,
      action,
    });

    if (action === "dismiss") {
      const result = await dismissFailedAuthReports(adminClient, {
        adminUserId: caller.id,
        notes,
        reportId: reportId || undefined,
        normalizedEmail: reportId ? undefined : normalizedEmail,
      });
      return NextResponse.json({
        success: true,
        action: "dismissed",
        resolvedReportIds: result.resolvedReportIds,
        resolvedCount: result.resolvedReportIds.length,
      });
    }

    // provision_temp_password
    if (!normalizedEmail) {
      return NextResponse.json(
        { error: "Report has no email — cannot provision access" },
        { status: 400 },
      );
    }

    const result = reportId
      ? await provisionUserAccessFromFailedAuth(adminClient, {
          reportId,
          adminUserId: caller.id,
          email: normalizedEmail,
          ipAddress,
          notes,
          origin: req.nextUrl.origin,
        })
      : await provisionUserAccessFromFailedAuth(adminClient, {
          normalizedEmail,
          adminUserId: caller.id,
          ipAddress,
          notes,
          origin: req.nextUrl.origin,
        });

    return NextResponse.json({
      success: true,
      action: "provisioned",
      userId: result.userId,
      email: result.email,
      emailSent: result.emailSent,
      emailSkippedReason: result.emailSkippedReason,
      createdAuthUser: result.createdAuthUser,
      forceOnboarding: result.forceOnboarding,
      resolvedReportIds: result.resolvedReportIds,
      resolvedCount: result.resolvedReportIds.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("failed-auth-reports/resolve:", msg);

    const adminMessage = msg.startsWith("Auth create failed:") ||
      msg.startsWith("Auth update failed:") ||
      msg.startsWith("Profile upsert failed:") ||
      msg.startsWith("Resend email failed:") ||
      msg.startsWith("Approval blocked:") ||
      msg.startsWith("No unresolved failed-login reports found") ||
      msg.startsWith("A valid email address is required")
      ? msg
      : "Failed to approve access. Check server logs for details.";

    return NextResponse.json({ error: adminMessage }, { status: 500 });
  }
}
