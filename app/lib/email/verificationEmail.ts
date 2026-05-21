function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Production uses NEXT_PUBLIC_APP_URL; local dev prefers the request origin so verify links hit localhost. */
export function getAppOrigin(fallback?: string): string {
  if (
    process.env.NODE_ENV === "development" &&
    fallback &&
    isLocalDevOrigin(fallback)
  ) {
    return fallback.replace(/\/$/, "");
  }
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (fallback) return fallback.replace(/\/$/, "");
  return "https://eod-hub.com";
}

export function buildVerifyEmailUrl(rawToken: string, origin: string): string {
  return `${origin}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
}

export const VERIFY_EMAIL_SUBJECT = "Verify your email — EOD HUB";

export function buildVerificationEmailHtml(params: {
  firstName: string;
  verifyUrl: string;
}): string {
  const { firstName, verifyUrl } = params;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 28px;">
        Built for EOD Techs, by an EOD Tech.
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        ${firstName},
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 24px;">
        Thank you for signing up for EOD-HUB — a private professional network built specifically for the EOD and bomb technician community.
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 28px;">
        Please verify your email address to continue. Once verified, your account will enter our administrative review process before full access is granted.
      </p>
      <a href="${verifyUrl}"
         style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px;">
        Verify Email
      </a>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 8px;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 13px; color: #2563eb; word-break: break-all; line-height: 1.5; margin: 0 0 28px;">
        ${verifyUrl}
      </p>
      <p style="font-size: 13px; color: #888; line-height: 1.6; margin: 0;">
        This link expires in 24 hours and can only be used once.
      </p>
      <p style="font-size: 13px; color: #999; margin-top: 32px; margin-bottom: 0;">
        Built for EOD Techs, by an EOD Tech.
      </p>
    </div>
  `;
}
