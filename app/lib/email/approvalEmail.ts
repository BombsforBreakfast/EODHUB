import { getAppOrigin } from "./verificationEmail";

export const APPROVAL_EMAIL_SUBJECT = "You've Been Approved for EOD-HUB";

export function buildLoginUrl(origin: string): string {
  return `${getAppOrigin(origin)}/login`;
}

export function buildApprovalEmailHtml(params: {
  firstName: string;
  loginUrl: string;
  referralCode?: string | null;
  approvedViaVouch?: boolean;
}): string {
  const { firstName, loginUrl, referralCode, approvedViaVouch } = params;

  const introExtra = approvedViaVouch
    ? "Three members of the EOD-HUB community vouched for you, and your account is now fully approved."
    : "Your account has been successfully verified and approved for full access to EOD-HUB.";

  const baseOrigin = loginUrl.replace(/\/login\/?$/, "");
  const referralSection = referralCode
    ? `
    <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 24px;">
      <p style="font-size: 15px; font-weight: 700; color: #111; margin: 0 0 8px;">Invite colleagues, earn a Recruiter Badge</p>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 14px;">
        Share your personal invite link with fellow EOD professionals. When 5 of them join and get verified, you earn your Bronze Recruiter badge on your profile.
      </p>
      <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 16px; font-size: 14px; font-weight: 700; word-break: break-all; color: #111;">
        ${baseOrigin}/login?ref=${referralCode}
      </div>
    </div>
    `
    : "";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; color: #000;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 28px;">
        Built for EOD Techs, by an EOD Tech.
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        ${firstName},
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        ${introExtra}
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 16px;">
        Welcome to the network. You now have access to jobs, businesses, events, community discussions, resources, and the broader EOD-HUB platform.
      </p>
      <a href="${loginUrl}"
         style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 8px 0 24px;">
        Log in to EOD-HUB
      </a>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 8px;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 13px; color: #2563eb; word-break: break-all; line-height: 1.5; margin: 0 0 28px;">
        ${loginUrl}
      </p>
      ${referralSection}
      <p style="font-size: 13px; color: #999; margin-top: 32px; margin-bottom: 0;">
        Built for EOD Techs, by an EOD Tech.
      </p>
    </div>
  `;
}
