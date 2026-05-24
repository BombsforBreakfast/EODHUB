import { getAppOrigin } from "./verificationEmail";

export type DigestType = "morning" | "evening";

export type DigestEmailItem = {
  label: string;
  href: string;
  meta?: string | null;
};

export type DigestEmailSection = {
  title: string;
  items: DigestEmailItem[];
};

export function buildNotificationPreferencesUrl(origin: string): string {
  return `${getAppOrigin(origin)}/account/notifications`;
}

export function buildDigestHomeUrl(origin: string): string {
  return `${getAppOrigin(origin)}/`;
}

export function digestSubject(type: DigestType): string {
  return type === "morning"
    ? "Your morning EOD-HUB digest"
    : "Your evening EOD-HUB digest";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderItems(items: DigestEmailItem[]): string {
  return items
    .slice(0, 8)
    .map((item) => {
      const meta = item.meta
        ? `<div style="font-size: 12px; color: #9ca3af; margin-top: 4px;">${escapeHtml(item.meta)}</div>`
        : "";
      return `
        <li style="margin: 0; padding: 14px 0; border-bottom: 1px solid #1f2937;">
          <a href="${escapeHtml(item.href)}" style="color: #ffffff; text-decoration: none; font-size: 15px; line-height: 1.5; font-weight: 700;">
            ${escapeHtml(item.label)}
          </a>
          ${meta}
        </li>
      `;
    })
    .join("");
}

function renderSection(section: DigestEmailSection): string {
  if (section.items.length === 0) return "";
  return `
    <div style="margin-top: 28px;">
      <h2 style="font-size: 17px; line-height: 1.3; color: #ffffff; margin: 0 0 10px; font-weight: 900;">
        ${escapeHtml(section.title)}
      </h2>
      <ul style="list-style: none; margin: 0; padding: 0;">
        ${renderItems(section.items)}
      </ul>
    </div>
  `;
}

export function buildDigestEmailHtml(params: {
  firstName: string;
  digestType: DigestType;
  personalSections: DigestEmailSection[];
  communitySections: DigestEmailSection[];
  digestUrl: string;
  preferencesUrl: string;
}): string {
  const {
    firstName,
    digestType,
    personalSections,
    communitySections,
    digestUrl,
    preferencesUrl,
  } = params;
  const intro =
    digestType === "morning"
      ? "Here is what happened overnight across your network and the broader EOD-HUB community."
      : "Here is what happened today across your network and the broader EOD-HUB community.";
  const personalHtml = personalSections.map(renderSection).join("");
  const communityHtml = communitySections.map(renderSection).join("");

  return `
    <div style="margin: 0; padding: 0; background: #05070a;">
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 28px 18px 36px;">
        <div style="background: #0b0f17; border: 1px solid #1f2937; border-radius: 18px; padding: 28px 22px;">
          <div style="font-size: 30px; font-weight: 900; letter-spacing: -1px; color: #ffffff; margin-bottom: 6px;">EOD HUB</div>
          <p style="font-size: 11px; color: #9ca3af; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; margin: 0 0 26px;">
            Built for EOD Techs, by an EOD Tech.
          </p>
          <p style="font-size: 16px; color: #ffffff; line-height: 1.7; margin: 0 0 12px;">
            ${escapeHtml(firstName)},
          </p>
          <p style="font-size: 15px; color: #d1d5db; line-height: 1.7; margin: 0 0 22px;">
            ${escapeHtml(intro)}
          </p>

          ${personalHtml}
          ${communityHtml}

          <div style="margin-top: 30px;">
            <a href="${escapeHtml(digestUrl)}"
               style="display: inline-block; background: #ffffff; color: #05070a; padding: 14px 24px; border-radius: 999px; text-decoration: none; font-weight: 900; font-size: 15px;">
              Open EOD-HUB
            </a>
          </div>

          <div style="border-top: 1px solid #1f2937; margin-top: 30px; padding-top: 18px;">
            <p style="font-size: 12px; color: #9ca3af; line-height: 1.6; margin: 0;">
              You are receiving this because email digests are enabled for your EOD-HUB account.
              <a href="${escapeHtml(preferencesUrl)}" style="color: #ffffff; text-decoration: underline;">Update notification preferences</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}
