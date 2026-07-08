import type { WeeklyAnalyticsRollup } from "@/app/lib/server/weeklyAnalyticsRollup";

export const WEEKLY_ANALYTICS_SUBJECT_PREFIX = "This week in EOD-HUB";

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

function formatMetricLine(newCount: number, totalCount: number, label: string): string {
  if (newCount > 0) {
    return `${newCount} new ${label} / ${totalCount} total ${label}`;
  }
  return `${totalCount} total ${label}`;
}

function buildNewMemberNamesList(names: string[]): string {
  if (names.length === 0) return "";
  const items = names
    .slice(0, 20)
    .map((name) => `<li style="margin: 0 0 4px;">${escapeHtml(name)}</li>`)
    .join("");
  return `
    <p style="margin: 16px 0 8px; font-size: 14px; color: #374151; font-weight: 700;">New members this week:</p>
    <ul style="margin: 0 0 0 18px; padding: 0; color: #111827; font-size: 14px; line-height: 1.45;">
      ${items}
    </ul>
  `;
}

export function buildWeeklyAnalyticsEmailHtml(params: {
  rollup: WeeklyAnalyticsRollup;
  firstName?: string | null;
}): string {
  const { rollup, firstName } = params;
  const appUrl = "https://www.EOD-HUB.com";
  const weekLabel = `${fmtDate(rollup.window_start)} – ${fmtDate(rollup.window_end)} (UTC)`;
  const salutation = firstName?.trim() ? `Hi ${escapeHtml(firstName.trim())},` : "Hi there,";
  const memberLine = formatMetricLine(
    rollup.this_week.new_members,
    rollup.platform.total_members,
    "members",
  );
  const jobsLine = formatMetricLine(rollup.this_week.new_jobs, rollup.platform.total_jobs, "jobs");
  const resourcesLine = formatMetricLine(
    rollup.this_week.new_resources,
    rollup.platform.total_resources,
    "resources",
  );
  const businessesLine = formatMetricLine(
    rollup.this_week.new_business_listings,
    rollup.platform.total_business_listings,
    "business listings",
  );
  const namesList = buildNewMemberNamesList(rollup.this_week.new_member_names ?? []);

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px; background: #f9fafb; color: #111827;">
      <div style="font-size: 30px; font-weight: 900; letter-spacing: -0.8px; margin-bottom: 6px;">This week in EOD-HUB</div>
      <p style="font-size: 13px; color: #6b7280; font-weight: 600; margin: 0 0 22px;">
        ${escapeHtml(weekLabel)}
      </p>

      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px;">
        <p style="font-size: 15px; color: #111827; margin: 0 0 14px; font-weight: 700;">${salutation}</p>
        <p style="font-size: 15px; color: #374151; margin: 0 0 12px;">Here is your weekly platform rollup:</p>
        <ul style="margin: 0; padding-left: 20px; color: #111827; font-size: 15px; line-height: 1.55;">
          <li style="margin: 0 0 8px;">${escapeHtml(memberLine)}</li>
          <li style="margin: 0 0 8px;">${escapeHtml(jobsLine)}</li>
          <li style="margin: 0 0 8px;">${escapeHtml(resourcesLine)}</li>
          <li style="margin: 0 0 8px;">${escapeHtml(businessesLine)}</li>
        </ul>
        ${namesList}
      </div>

      <a href="${escapeHtml(appUrl)}"
         style="display: inline-block; margin-top: 24px; background: #111827; color: #ffffff; padding: 13px 26px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
        Log in to connect
      </a>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 18px;">
        If the button does not work, open
        <a href="${escapeHtml(appUrl)}" style="color: #4b5563; text-decoration: underline;">${escapeHtml(appUrl)}</a>
        in your browser.
      </p>
    </div>
  `;
}

export function weeklyAnalyticsSubject(rollup: WeeklyAnalyticsRollup): string {
  return `${WEEKLY_ANALYTICS_SUBJECT_PREFIX} — ${rollup.this_week.new_members} new members`;
}
