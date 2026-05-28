import type { SupabaseClient } from "@supabase/supabase-js";

/** Pending items admins may need to act on (matches admin panel tabs). */
export type AdminPendingBreakdown = {
  biz: number;
  jobs: number;
  jobsStale: number;
  users: number;
  flags: number;
  bugs: number;
  dir: number;
  locReq: number;
  scrapbook: number;
  failedAuth: number;
};

const FAILED_AUTH_REVIEW_WINDOW_DAYS = 30;

export async function fetchAdminPendingBreakdown(client: SupabaseClient): Promise<AdminPendingBreakdown> {
  const failedAuthCutoffIso = new Date(
    Date.now() - FAILED_AUTH_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    bizRes,
    bizClaimsRes,
    jobRes,
    jobStaleRes,
    userRes,
    flagRes,
    reportRes,
    dirRes,
    locRes,
    memorialScrapbookRes,
    eventScrapbookRes,
    failedAuthRes,
  ] = await Promise.all([
    client.from("business_listings").select("*", { count: "exact", head: true }).neq("is_approved", true),
    client.from("business_listing_claims").select("*", { count: "exact", head: true }).eq("status", "pending"),
    client.from("jobs").select("*", { count: "exact", head: true }).neq("is_approved", true),
    // Number of distinct jobs with at least one open stale-report. The
    // partial-index on community_stale_count keeps this read cheap.
    client.from("jobs").select("*", { count: "exact", head: true }).gt("community_stale_count", 0),
    client
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("email_verified", true)
      .in("verification_status", ["awaiting_admin_review", "pending_admin_review", "pending"]),
    client.from("flags").select("*", { count: "exact", head: true }).eq("reviewed", false),
    client.from("bug_reports").select("*", { count: "exact", head: true }).eq("status", "new"),
    client.from("unit_directory").select("*", { count: "exact", head: true }).eq("is_approved", false),
    client.from("location_requests").select("*", { count: "exact", head: true }).eq("reviewed", false),
    client.from("memorial_scrapbook_items").select("*", { count: "exact", head: true }).in("status", ["pending", "flagged"]),
    client.from("event_scrapbook_items").select("*", { count: "exact", head: true }).in("status", ["pending", "flagged"]),
    // Failed auth reports: count distinct emails with unresolved attempts in
    // the last 30 days. The select returns plain rows (no count) so we can
    // dedupe by normalized_email client-side — Supabase has no DISTINCT count.
    client
      .from("failed_auth_reports")
      .select("normalized_email")
      .is("admin_decision", null)
      .gte("created_at", failedAuthCutoffIso)
      .limit(2000),
  ]);
  const claimsPending = bizClaimsRes.error ? 0 : (bizClaimsRes.count ?? 0);

  let failedAuth = 0;
  if (!failedAuthRes.error && Array.isArray(failedAuthRes.data)) {
    const uniqueEmails = new Set<string>();
    let nullEmailReports = 0;
    for (const row of failedAuthRes.data as Array<{ normalized_email: string | null }>) {
      const email = row.normalized_email?.trim().toLowerCase();
      if (email) {
        uniqueEmails.add(email);
      } else {
        nullEmailReports += 1;
      }
    }
    failedAuth = uniqueEmails.size + nullEmailReports;
  }

  return {
    biz: (bizRes.count ?? 0) + claimsPending,
    jobs: jobRes.count ?? 0,
    jobsStale: jobStaleRes.error ? 0 : (jobStaleRes.count ?? 0),
    users: userRes.count ?? 0,
    flags: flagRes.count ?? 0,
    bugs: reportRes.count ?? 0,
    dir: dirRes.count ?? 0,
    locReq: locRes.count ?? 0,
    scrapbook:
      (memorialScrapbookRes.error ? 0 : (memorialScrapbookRes.count ?? 0)) +
      (eventScrapbookRes.error ? 0 : (eventScrapbookRes.count ?? 0)),
    failedAuth,
  };
}

export function sumAdminPending(b: AdminPendingBreakdown): number {
  return (
    b.biz +
    b.jobs +
    b.jobsStale +
    b.users +
    b.flags +
    b.bugs +
    b.dir +
    b.locReq +
    b.scrapbook +
    b.failedAuth
  );
}

/** Same cap style as NavBar notification badges */
export function formatNavBadgeCount(count: number): string {
  if (count <= 0) return "0";
  return count > 9 ? "9+" : String(count);
}
