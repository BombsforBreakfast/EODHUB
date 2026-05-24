import { getAppOrigin } from "./verificationEmail";

export const FAILED_AUTH_ALERT_SUBJECT_PREFIX = "High-risk failed auth attempts";

export type FailedAuthAlertGroup = {
  email: string;
  attemptCount: number;
  latestReason: string;
  latestRiskLevel: string;
  latestCreatedAt: string;
  ipAddresses: string[];
};

export function buildFailedAuthAlertHtml(params: {
  groups: FailedAuthAlertGroup[];
  origin: string;
}): string {
  const { groups, origin } = params;
  const adminUrl = `${getAppOrigin(origin)}/admin`;

  const rows = groups
    .map((g) => {
      const when = new Date(g.latestCreatedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const ips = g.ipAddresses.slice(0, 3).join(", ") || "—";
      return `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 700;">${escapeHtml(g.email)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #666;">${g.attemptCount}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #666;">${escapeHtml(g.latestReason)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #666;">${when}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #666; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;">${escapeHtml(ips)}</td>
        </tr>
      `;
    })
    .join("");

  const count = groups.length;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 24px;">
        Admin alert
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 16px;">
        <strong>${count}</strong> high-risk failed auth attempt${count === 1 ? "" : "s"} in the last 24 hours need review.
      </p>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 20px;">
        Each row groups all unresolved attempts from one email address. Open the Failed Auth tab to approve legitimate users (sends a temporary password) or dismiss the report.
      </p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
        <thead>
          <tr style="background: #f3f4f6;">
            <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Email</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Attempts</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Latest Reason</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Latest</th>
            <th style="padding: 8px 12px; text-align: left; font-weight: 700;">IPs</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="${adminUrl}"
         style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
        Open Failed Auth tab
      </a>
      <p style="font-size: 13px; color: #999; margin-top: 32px;">
        Built for EOD Techs, by an EOD Tech.
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
