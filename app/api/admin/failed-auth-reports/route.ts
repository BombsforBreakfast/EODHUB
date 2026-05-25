import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  FAILED_AUTH_REASONS,
  classifyFailedLoginAttempt,
  isFailedAuthReason,
  type FailedLoginClassification,
  type FailedLoginWaitlistStatus,
} from "@/app/lib/auth/failedAuthReasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin Failed Auth tab data source.
 *
 * Bearer-auth → profiles.is_admin check → service-role read of failed_auth_reports.
 * Mirrors the pattern in /api/admin/engagement and /api/admin/page-analytics.
 *
 * Returns a summary header (24h KPIs) plus up to 100 most recent rows for the
 * requested filter window. Email/IP search are case-insensitive contains.
 */

type Range = "24h" | "7d" | "30d" | "all";
const VALID_RANGES: ReadonlySet<Range> = new Set(["24h", "7d", "30d", "all"]);
const VALID_RISK = new Set(["LOW", "MEDIUM", "HIGH"]);
const REPORT_LIMIT_MAX = 100;

function rangeStartIso(range: Range): string | null {
  if (range === "all") return null;
  const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function parseRange(value: string | null): Range {
  if (value && (VALID_RANGES as ReadonlySet<string>).has(value)) return value as Range;
  return "24h";
}

function parseLimit(value: string | null): number {
  if (!value) return REPORT_LIMIT_MAX;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return REPORT_LIMIT_MAX;
  return Math.min(n, REPORT_LIMIT_MAX);
}

export type FailedAuthReportRow = {
  id: string;
  created_at: string;
  email_attempted: string | null;
  normalized_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  source_route: string | null;
  failure_reason: string;
  error_code: string | null;
  raw_error_message: string | null;
  turnstile_status: string | null;
  turnstile_error: string | null;
  user_exists_in_auth: boolean | null;
  user_exists_in_profiles: boolean | null;
  verification_status: string | null;
  request_id: string;
  attempt_count: number | null;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  admin_decision: string | null;
  admin_decided_at: string | null;
  admin_decided_by: string | null;
  admin_notes: string | null;
};

export type FailedAuthSummary = {
  total24h: number;
  turnstileFailures24h: number;
  accountCreationFailures24h: number;
  highRisk24h: number;
  topFailureReason: { reason: string; count: number } | null;
};

export type FailedAuthReportGroup = {
  /**
   * Stable group key. Uses normalized_email when present; falls back to
   * "(no-email)" so reports without an email still bucket together for
   * dismissal. NOT used as a foreign key — purely a UI grouping.
   */
  groupKey: string;
  normalizedEmail: string | null;
  /** Display email (mixed case original from the most recent attempt). */
  displayEmail: string | null;
  attemptCount: number;
  latestCreatedAt: string;
  latestReason: string;
  latestRiskLevel: "LOW" | "MEDIUM" | "HIGH";
  latestErrorCode: string | null;
  ipAddresses: string[];
  sourceRoutes: string[];
  failureReasons: string[];
  userExistsInAuth: boolean | null;
  userExistsInProfiles: boolean | null;
  verificationStatus: string | null;
  /** Most recent decision among the grouped reports, if any. */
  adminDecision: string | null;
  adminDecidedAt: string | null;
  adminDecidedBy: string | null;
  adminNotes: string | null;
  waitlistStatus: FailedLoginWaitlistStatus;
  classification: FailedLoginClassification;
  reportIds: string[];
  reports: FailedAuthReportRow[];
};

export type FailedAuthApiResponse = {
  summary: FailedAuthSummary;
  reports: FailedAuthReportRow[];
  totalCount: number;
  /**
   * Reports bucketed by normalized_email, restricted to unresolved attempts
   * in the last 30 days. The admin panel uses this for the primary triage
   * view; the flat `reports` array is still returned for the archival view
   * and respects the same filters.
   */
  groups: FailedAuthReportGroup[];
};

const GROUP_WINDOW_DAYS = 30;
const GROUP_REPORT_LIMIT = 1000;
const GROUP_KEY_NO_EMAIL = "(no-email)";

function maxAttemptCount(rows: FailedAuthReportRow[]): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (typeof row.attempt_count !== "number") continue;
    max = max === null ? row.attempt_count : Math.max(max, row.attempt_count);
  }
  return max;
}

function classifyGroup(
  group: Omit<FailedAuthReportGroup, "waitlistStatus" | "classification">,
  waitlistStatus: FailedLoginWaitlistStatus,
): FailedLoginClassification {
  return classifyFailedLoginAttempt({
    email: group.normalizedEmail,
    reason: group.latestReason,
    waitlistStatus,
    authExists: group.userExistsInAuth,
    profileExists: group.userExistsInProfiles,
    riskLevel: group.latestRiskLevel,
    attemptCount: maxAttemptCount(group.reports) ?? group.attemptCount,
  });
}

function buildGroups(rows: FailedAuthReportRow[]): FailedAuthReportGroup[] {
  const map = new Map<string, FailedAuthReportGroup>();

  for (const row of rows) {
    const normalized = row.normalized_email?.trim().toLowerCase() ?? null;
    const key = normalized || GROUP_KEY_NO_EMAIL;
    const existing = map.get(key);
    if (existing) {
      existing.attemptCount += 1;
      existing.reportIds.push(row.id);
      existing.reports.push(row);
      if (row.ip_address && !existing.ipAddresses.includes(row.ip_address)) {
        existing.ipAddresses.push(row.ip_address);
      }
      if (row.source_route && !existing.sourceRoutes.includes(row.source_route)) {
        existing.sourceRoutes.push(row.source_route);
      }
      if (!existing.failureReasons.includes(row.failure_reason)) {
        existing.failureReasons.push(row.failure_reason);
      }
      if (row.created_at > existing.latestCreatedAt) {
        existing.latestCreatedAt = row.created_at;
        existing.latestReason = row.failure_reason;
        existing.latestRiskLevel = row.risk_level;
        existing.latestErrorCode = row.error_code;
        existing.displayEmail = row.email_attempted ?? existing.displayEmail;
        existing.userExistsInAuth = row.user_exists_in_auth ?? existing.userExistsInAuth;
        existing.userExistsInProfiles =
          row.user_exists_in_profiles ?? existing.userExistsInProfiles;
        existing.verificationStatus =
          row.verification_status ?? existing.verificationStatus;
      }
      if (row.admin_decision && !existing.adminDecision) {
        existing.adminDecision = row.admin_decision;
        existing.adminDecidedAt = row.admin_decided_at;
        existing.adminDecidedBy = row.admin_decided_by;
        existing.adminNotes = row.admin_notes;
      }
    } else {
      map.set(key, {
        groupKey: key,
        normalizedEmail: normalized,
        displayEmail: row.email_attempted ?? normalized,
        attemptCount: 1,
        latestCreatedAt: row.created_at,
        latestReason: row.failure_reason,
        latestRiskLevel: row.risk_level,
        latestErrorCode: row.error_code,
        ipAddresses: row.ip_address ? [row.ip_address] : [],
        sourceRoutes: row.source_route ? [row.source_route] : [],
        failureReasons: [row.failure_reason],
        userExistsInAuth: row.user_exists_in_auth,
        userExistsInProfiles: row.user_exists_in_profiles,
        verificationStatus: row.verification_status,
        adminDecision: row.admin_decision,
        adminDecidedAt: row.admin_decided_at,
        adminDecidedBy: row.admin_decided_by,
        adminNotes: row.admin_notes,
        waitlistStatus: "unknown",
        classification: {
          reviewable: true,
          suspicious: false,
          severity: "low",
          adminCanOverride: true,
          displayReason: "Review the failed sign-in context before taking action.",
        },
        reportIds: [row.id],
        reports: [row],
      });
    }
  }

  const groups = [...map.values()].map((group) => ({
    ...group,
    classification: classifyGroup(group, "unknown"),
  }));

  return groups.sort(
    (a, b) =>
      new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
  );
}

async function addWaitlistContext(
  admin: SupabaseClient,
  groups: FailedAuthReportGroup[],
): Promise<FailedAuthReportGroup[]> {
  const emails = groups
    .map((group) => group.normalizedEmail?.trim().toLowerCase())
    .filter((email): email is string => !!email);

  if (emails.length === 0) return groups;

  const { data, error } = await admin
    .from("waitlist_signups")
    .select("email")
    .limit(10000);

  if (error) {
    return groups.map((group) => ({
      ...group,
      waitlistStatus: "unknown",
      classification: classifyGroup(group, "unknown"),
    }));
  }

  const waitlisted = new Set(
    ((data ?? []) as Array<{ email: string | null }>)
      .map((row) => row.email?.trim().toLowerCase())
      .filter((email): email is string => !!email),
  );

  return groups.map((group) => {
    const waitlistStatus: FailedLoginWaitlistStatus = group.normalizedEmail
      ? waitlisted.has(group.normalizedEmail) ? "in_waitlist" : "not_in_waitlist"
      : "unknown";
    return {
      ...group,
      waitlistStatus,
      classification: classifyGroup(group, waitlistStatus),
    };
  });
}

export async function GET(req: NextRequest) {
  // ---- 1. Authn: Bearer token ----
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ---- 2. Authz: profiles.is_admin ----
  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ---- 3. Filters ----
  const { searchParams } = req.nextUrl;
  const range = parseRange(searchParams.get("range"));
  const sinceIso = rangeStartIso(range);
  const emailFilter = searchParams.get("email")?.trim() ?? "";
  const ipFilter = searchParams.get("ip")?.trim() ?? "";
  const failureReasonFilter = searchParams.get("failure_reason")?.trim() ?? "";
  const riskFilter = searchParams.get("risk_level")?.trim().toUpperCase() ?? "";
  const limit = parseLimit(searchParams.get("limit"));

  const admin = createClient(supabaseUrl, serviceKey);

  // ---- 4. Summary (always last 24h regardless of selected range) ----
  const last24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    total24hResult,
    turnstile24hResult,
    accountCreation24hResult,
    highRisk24hResult,
    reasonsResult,
  ] = await Promise.all([
    admin
      .from("failed_auth_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24hIso),
    admin
      .from("failed_auth_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24hIso)
      .in("failure_reason", ["TURNSTILE_FAILED", "CAPTCHA_FAILED"]),
    admin
      .from("failed_auth_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24hIso)
      .in("failure_reason", ["ACCOUNT_CREATION_FAILED", "PROFILE_CREATION_FAILED", "OAUTH_ACCOUNT_EXISTS"]),
    admin
      .from("failed_auth_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24hIso)
      .eq("risk_level", "HIGH"),
    admin
      .from("failed_auth_reports")
      .select("failure_reason")
      .gte("created_at", last24hIso)
      .limit(5000),
  ]);

  let topFailureReason: FailedAuthSummary["topFailureReason"] = null;
  if (!reasonsResult.error && Array.isArray(reasonsResult.data)) {
    const counts = new Map<string, number>();
    for (const row of reasonsResult.data as Array<{ failure_reason: string | null }>) {
      const reason = row.failure_reason ?? "UNKNOWN";
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    let bestReason: string | null = null;
    let bestCount = 0;
    for (const [reason, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestReason = reason;
      }
    }
    if (bestReason) topFailureReason = { reason: bestReason, count: bestCount };
  }

  const summary: FailedAuthSummary = {
    total24h: total24hResult.count ?? 0,
    turnstileFailures24h: turnstile24hResult.count ?? 0,
    accountCreationFailures24h: accountCreation24hResult.count ?? 0,
    highRisk24h: highRisk24hResult.count ?? 0,
    topFailureReason,
  };

  // ---- 5. Reports (filtered) ----
  let reportsQuery = admin
    .from("failed_auth_reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (sinceIso) reportsQuery = reportsQuery.gte("created_at", sinceIso);

  if (emailFilter) {
    // Search both normalized + raw fields case-insensitively.
    const safe = emailFilter.replace(/[%_]/g, "\\$&").toLowerCase();
    reportsQuery = reportsQuery.or(
      `normalized_email.ilike.%${safe}%,email_attempted.ilike.%${safe}%`,
    );
  }
  if (ipFilter) {
    const safe = ipFilter.replace(/[%_]/g, "\\$&");
    reportsQuery = reportsQuery.ilike("ip_address", `%${safe}%`);
  }
  if (failureReasonFilter && isFailedAuthReason(failureReasonFilter)) {
    reportsQuery = reportsQuery.eq("failure_reason", failureReasonFilter);
  }
  if (riskFilter && VALID_RISK.has(riskFilter)) {
    reportsQuery = reportsQuery.eq("risk_level", riskFilter);
  }

  const { data: reports, count: totalCount, error: reportsError } = await reportsQuery;
  if (reportsError) {
    return NextResponse.json({ error: "Query failed", detail: reportsError.message }, { status: 500 });
  }

  // ---- 6. Grouped triage view (unresolved + last 30 days) ----
  const groupCutoffIso = new Date(
    Date.now() - GROUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: groupRows, error: groupError } = await admin
    .from("failed_auth_reports")
    .select("*")
    .is("admin_decision", null)
    .gte("created_at", groupCutoffIso)
    .order("created_at", { ascending: false })
    .limit(GROUP_REPORT_LIMIT);

  const groups = groupError
    ? []
    : await addWaitlistContext(admin, buildGroups((groupRows ?? []) as FailedAuthReportRow[]));

  const response: FailedAuthApiResponse = {
    summary,
    reports: (reports ?? []) as FailedAuthReportRow[],
    totalCount: totalCount ?? 0,
    groups,
  };

  return NextResponse.json(response);
}

export { FAILED_AUTH_REASONS };
