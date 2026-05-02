/**
 * Emails authorized to become EOD HUB staff ("pure admin") accounts.
 *
 * When any user in this list signs in for the first time (via Google OAuth),
 * the onboarding page auto-promotes their profile to `is_pure_admin=true`
 * with full admin god rights and skips all profile-building questions.
 *
 * To add another staff account: add its email here and redeploy.
 */
export const PURE_ADMIN_EMAILS = ["hello@eod-hub.com"] as const;

/** Public path to the EOD HUB line-art logo; used as the default staff profile photo in nav and profile. */
export const STAFF_DEFAULT_PROFILE_PHOTO_PATH = "/branding/eod-crab-logo.png" as const;

export function isPureAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PURE_ADMIN_EMAILS.some((e) => e.toLowerCase() === normalized);
}
