import { hasFullPlatformAccess, type VerificationProfile } from "../verificationAccess";

/** API-only identity class. Portal permissions live in server-managed records. */
export const PORTAL_ROLE = "eod_portal";
export const PORTAL_ROLES = [PORTAL_ROLE, "eod_rental", "eod_ticketing"] as const;
export type Portal = "hub" | "rentals" | "events";
export function isPortalOnlyIdentity(user: { role?: string } | null | undefined) {
  return !!user?.role && (PORTAL_ROLES as readonly string[]).includes(user.role);
}
export function accountApiAllowed(path: string) {
  return path === "/api/account" || path.startsWith("/api/account/") || path === "/api/shared-auth" || path.startsWith("/api/shared-auth/") || path === "/api/auth/oauth-native-complete" || path === "/api/auth/session-check" || path === "/api/check-duplicate-email" || path === "/api/auth/send-verification-email" || path === "/api/auth/verify-email";
}
export function portalDestination(portal: Portal) {
  return portal === "rentals" ? "/promote/rentals/portal" : portal === "events" ? "/ticketing/workspace" : "/onboarding";
}
export function parsePortal(value: unknown): Portal { return value === "rentals" || value === "events" ? value : "hub"; }
/** Shared auth may return only to these local pages, never a caller-supplied URL. */
export function safeAccountReturn(value: unknown, fallback = "/account") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  try {
    const url = new URL(value, "https://eod-hub.com");
    const path = url.pathname;
    return path === "/account" || path.startsWith("/account/") || path === "/onboarding" || path === "/pending" || path === "/verify-email" || path === "/" || path === "/promote/rentals/portal" || path.startsWith("/ticketing/") ? path + url.search : fallback;
  } catch { return fallback; }
}
export type AccountAccessInput = {
  profile: VerificationProfile | null;
  rental: { status: string } | null;
  events: { active: boolean; can_submit_events: boolean } | null;
  assignments: { role: string; expires_at: string | null; revoked_at: string | null }[];
  bannedUntil?: string | null;
  organizerSuspended?: boolean;
};
export function accountAccess(input: AccountAccessInput, now = Date.now()) {
  const active = !input.bannedUntil || Date.parse(input.bannedUntil) <= now;
  const assignments = input.assignments.filter(row => !row.revoked_at && (row.expires_at ? Date.parse(row.expires_at) > now : row.role === "coordinator"));
  return {
    hub: active && !!input.profile && hasFullPlatformAccess(input.profile),
    rentals: active && input.rental?.status === "approved",
    events: active && !input.organizerSuspended && input.events?.active === true && (input.events.can_submit_events || assignments.some(row => row.role === "coordinator")),
    eventOperator: active && input.events?.active === true && assignments.some(row => row.role === "checkin_staff"),
    tickets: active,
  };
}
