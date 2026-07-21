import { getAppOrigin } from "./verificationEmail";

export const ARCADE_CREDITS_REFILL_EMAIL_SUBJECT =
  "Game Credits now full — go play EOD Arcade";

export function buildArcadeCreditsRefillEmailHtml(params: {
  firstName: string;
  arcadeUrl: string;
}): string {
  const { firstName, arcadeUrl } = params;
  const greeting = firstName.trim() ? `${firstName.trim()},` : "Hey,";

  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 8px; color: #000;">EOD HUB</div>
      <p style="font-size: 12px; color: #888; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 28px;">
        EOD Arcade
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        ${greeting}
      </p>
      <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 20px;">
        Your game credits are full again. Jump back into EOD Arcade and play.
      </p>
      <a href="${arcadeUrl}"
         style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin: 8px 0 24px;">
        Open EOD Arcade
      </a>
      <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 8px;">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="font-size: 13px; color: #2563eb; word-break: break-all; line-height: 1.5; margin: 0 0 28px;">
        ${arcadeUrl}
      </p>
      <p style="font-size: 13px; color: #999; margin-top: 32px; margin-bottom: 0;">
        Built for EOD Techs, by an EOD Tech.
      </p>
    </div>
  `;
}

export function buildArcadeCreditsRefillArcadeUrl(origin?: string): string {
  return `${getAppOrigin(origin)}/games`;
}
