import type { SupabaseClient } from "@supabase/supabase-js";

/** Pending items admins may need to act on (matches admin panel tabs). */
export type AdminPendingBreakdown = {
  biz: number;
  jobs: number;
  users: number;
  flags: number;
  reports: number;
  dir: number;
  locReq: number;
};

export async function fetchAdminPendingBreakdown(client: SupabaseClient): Promise<AdminPendingBreakdown> {
  const [bizRes, jobRes, userRes, flagRes, reportRes, dirRes, locRes] = await Promise.all([
    client.from("business_listings").select("*", { count: "exact", head: true }).neq("is_approved", true),
    client.from("jobs").select("*", { count: "exact", head: true }).neq("is_approved", true),
    client.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending"),
    client.from("flags").select("*", { count: "exact", head: true }).eq("reviewed", false),
    client.from("bug_reports").select("*", { count: "exact", head: true }).eq("reviewed", false),
    client.from("unit_directory").select("*", { count: "exact", head: true }).eq("is_approved", false),
    client.from("location_requests").select("*", { count: "exact", head: true }).eq("reviewed", false),
  ]);
  return {
    biz: bizRes.count ?? 0,
    jobs: jobRes.count ?? 0,
    users: userRes.count ?? 0,
    flags: flagRes.count ?? 0,
    reports: reportRes.count ?? 0,
    dir: dirRes.count ?? 0,
    locReq: locRes.count ?? 0,
  };
}

export function sumAdminPending(b: AdminPendingBreakdown): number {
  return b.biz + b.jobs + b.users + b.flags + b.reports + b.dir + b.locReq;
}

/** Same cap style as NavBar notification badges */
export function formatNavBadgeCount(count: number): string {
  if (count <= 0) return "0";
  return count > 9 ? "9+" : String(count);
}
