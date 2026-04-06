import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generic digest numbers for v1. Extend or replace with per-user queries later
 * (e.g. pass userId / last_active into fetchReengagementDigestStats).
 */
export type ReengagementDigestStats = {
  newUsers: number;
  newJobs: number;
  newWallPosts: number;
  newUnits: number;
  windowDays: number;
};

/** Hook for future personalization (name, segments, “since you left”, etc.). */
export type ReengagementUserContext = {
  userId: string;
  email: string;
  firstName: string | null;
};

const DEFAULT_BASE = "https://eod-hub.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function fetchReengagementDigestStats(
  admin: SupabaseClient,
  windowDays: number
): Promise<ReengagementDigestStats> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  const sinceIso = since.toISOString();

  const [usersRes, jobsRes, postsRes, unitsRes] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
    admin
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .eq("is_approved", true),
    admin.from("posts").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
    admin.from("units").select("*", { count: "exact", head: true }).gte("created_at", sinceIso),
  ]);

  const err =
    usersRes.error || jobsRes.error || postsRes.error || unitsRes.error;
  if (err) {
    throw new Error(err.message);
  }

  return {
    newUsers: usersRes.count ?? 0,
    newJobs: jobsRes.count ?? 0,
    newWallPosts: postsRes.count ?? 0,
    newUnits: unitsRes.count ?? 0,
    windowDays,
  };
}

export function buildReengagementEmailHtml(
  stats: ReengagementDigestStats,
  ctx: ReengagementUserContext,
  baseUrl: string = process.env.REENGAGEMENT_APP_BASE_URL ?? DEFAULT_BASE
): string {
  const safeBase = baseUrl.replace(/\/$/, "");
  const name = ctx.firstName?.trim() ? escapeHtml(ctx.firstName.trim()) : "there";

  const row = (label: string, value: number) =>
    `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(label)}</td><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 700;">${value}</td></tr>`;

  return `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 24px;">EOD HUB</div>
        <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 24px;">
          Hi ${name} — here’s what’s been happening on EOD HUB over the last <strong>${stats.windowDays}</strong> days:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Activity</th>
              <th style="padding: 8px 12px; text-align: left; font-weight: 700;">New</th>
            </tr>
          </thead>
          <tbody>
            ${row("Members joined", stats.newUsers)}
            ${row("Jobs posted (approved)", stats.newJobs)}
            ${row("Wall posts", stats.newWallPosts)}
            ${row("Units created", stats.newUnits)}
          </tbody>
        </table>
        <a href="${escapeHtml(safeBase)}/login"
           style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
          Sign in to EOD HUB
        </a>
        <p style="font-size: 13px; color: #999; margin-top: 32px;">
          Built for EOD Techs, by an EOD Tech.
        </p>
      </div>
    `;
}
