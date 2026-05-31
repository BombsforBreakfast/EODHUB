import type { WeeklyAnalyticsRollup } from "@/app/lib/server/weeklyAnalyticsRollup";
import { getAppOrigin } from "./verificationEmail";

export const WEEKLY_ANALYTICS_SUBJECT_PREFIX = "Weekly platform rollup";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function metricRow(label: string, value: number | string, highlight = false): string {
  return `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #444;">${escapeHtml(label)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: ${highlight ? "800" : "700"}; color: #111;">${escapeHtml(String(value))}</td>
    </tr>
  `;
}

function section(title: string, rows: string): string {
  return `
    <h2 style="font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #666; margin: 28px 0 10px;">${escapeHtml(title)}</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function buildWeeklyAnalyticsEmailHtml(params: {
  rollup: WeeklyAnalyticsRollup;
  origin: string;
}): string {
  const { rollup, origin } = params;
  const adminUrl = `${getAppOrigin(origin)}/admin`;
  const weekLabel = `${fmtDate(rollup.window_start)} – ${fmtDate(rollup.window_end)} (UTC)`;

  const thisWeekRows = [
    metricRow("New member signups", rollup.this_week.new_users, true),
    metricRow("Newly admin-verified", rollup.this_week.new_verified),
    metricRow("New community jobs posted", rollup.this_week.new_community_jobs),
    metricRow("New resources added", rollup.this_week.new_resources),
    metricRow("New feed posts", rollup.this_week.new_posts),
    metricRow("New recruits (referral signups)", rollup.this_week.new_recruits),
    metricRow("New Plank Holders awarded", rollup.this_week.new_plank_holders),
  ].join("");

  const platformRows = [
    metricRow("Total members", rollup.platform.total_members, true),
    metricRow("Verified members", rollup.platform.verified_members),
    metricRow("Pending verification", rollup.platform.pending_verification),
    metricRow("Completed profiles", rollup.platform.completed_profiles),
    metricRow("Weekly active users (WAU)", rollup.platform.wau, true),
    metricRow("Plank Holders (all time)", rollup.platform.plank_holders),
    metricRow("Members who recruited ≥1", rollup.platform.recruiters),
    metricRow("Signed in, never tracked in app", rollup.platform.authenticated_untracked),
  ].join("");

  const engagementRows = [
    metricRow("Members who posted", rollup.this_week_engagement.distinct_posters),
    metricRow("Members who commented", rollup.this_week_engagement.distinct_commenters),
    metricRow("Members with app activity", rollup.this_week_engagement.active_users, true),
  ].join("");

  const demoRows = [
    metricRow("Active Duty", rollup.demographics.active_duty),
    metricRow("Retired", rollup.demographics.retired),
    metricRow("Former", rollup.demographics.former),
    metricRow("Army", rollup.demographics.army),
    metricRow("Marines", rollup.demographics.marines),
    metricRow("Air Force", rollup.demographics.air_force),
    metricRow("Navy", rollup.demographics.navy),
    metricRow("Civilian Bomb Tech / LEO", rollup.demographics.civilian_bomb_tech),
  ].join("");

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px; background: #fafafa;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 8px;">
        Weekly analytics
      </p>
      <p style="font-size: 15px; color: #555; margin: 0 0 24px;">${escapeHtml(weekLabel)}</p>

      ${section("This week", thisWeekRows)}
      ${section("Platform snapshot", platformRows)}
      ${section("Engagement this week", engagementRows)}
      ${section("Member demographics (all time)", demoRows)}

      <a href="${adminUrl}"
         style="display: inline-block; margin-top: 28px; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
        Open admin panel
      </a>
      <p style="font-size: 13px; color: #999; margin-top: 32px;">
        Automated weekly rollup. Staff accounts excluded from member metrics.
      </p>
    </div>
  `;
}

export function weeklyAnalyticsSubject(rollup: WeeklyAnalyticsRollup): string {
  return `${WEEKLY_ANALYTICS_SUBJECT_PREFIX} — +${rollup.this_week.new_users} users, WAU ${rollup.platform.wau} — EOD HUB`;
}
