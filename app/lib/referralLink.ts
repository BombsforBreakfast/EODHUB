/**
 * Canonical invite URL for the login page + ?ref= code (matches profile "Referral Link" copy).
 * Local/dev hosts always resolve to production so shared QR codes never point to localhost.
 */
const DEFAULT_PUBLIC_ORIGIN = "https://eod-hub.com";

export function buildLoginReferralUrl(referralCode: string): string {
  const code = referralCode.trim();
  let origin = DEFAULT_PUBLIC_ORIGIN;
  if (typeof window !== "undefined" && typeof window.location?.origin === "string" && window.location.origin) {
    const hostname = window.location.hostname.toLowerCase();
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    origin = isLocalHost ? DEFAULT_PUBLIC_ORIGIN : window.location.origin;
  }
  return `${origin}/login?ref=${encodeURIComponent(code)}`;
}
