import { getAppOrigin } from "./verificationEmail";

export const TEMP_PASSWORD_EMAIL_SUBJECT = "Your temporary EOD-HUB sign-in password";

export function buildLoginUrl(origin: string): string {
  return `${getAppOrigin(origin)}/login`;
}

export function buildTemporaryPasswordEmailHtml(params: {
  loginUrl: string;
  email: string;
  temporaryPassword: string;
}): string {
  const { loginUrl, email, temporaryPassword } = params;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; color: #000;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 28px;">
        Built for EOD Techs, by an EOD Tech.
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        An EOD-HUB administrator has restored access to your account. Use the temporary password below to sign in.
      </p>
      <div style="background: #f3f4f6; border-radius: 10px; padding: 16px 18px; margin: 0 0 20px;">
        <p style="font-size: 13px; color: #555; margin: 0 0 6px; font-weight: 700;">Email</p>
        <p style="font-size: 15px; color: #111; margin: 0 0 14px; word-break: break-all;">${email}</p>
        <p style="font-size: 13px; color: #555; margin: 0 0 6px; font-weight: 700;">Temporary password</p>
        <p style="font-size: 18px; color: #111; margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.5px;">${temporaryPassword}</p>
      </div>
      <p style="font-size: 15px; color: #222; line-height: 1.7; margin: 0 0 16px;">
        After you sign in, you will complete onboarding to set up your profile. Then go to <strong>My Account → Sign-In Methods</strong> to choose a new password.
      </p>
      <a href="${loginUrl}"
         style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 8px 0 24px;">
        Sign in to EOD-HUB
      </a>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 8px;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 13px; color: #2563eb; word-break: break-all; line-height: 1.5; margin: 0 0 28px;">
        ${loginUrl}
      </p>
      <p style="font-size: 13px; color: #999; margin-top: 32px; margin-bottom: 0;">
        If you did not request this, contact EOD-HUB support.
      </p>
    </div>
  `;
}
