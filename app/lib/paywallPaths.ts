import { isPaywallEnforced } from "./paywallWorkflow";

/** Routes a member may visit without an active subscription (after trial / paywall). */
export const MEMBER_PAYWALL_EXEMPT_PATHS = [
  "/subscribe",
  "/profile",
  "/pending",
  "/onboarding",
  "/login",
  "/privacy",
  "/guidelines",
] as const;

export function isMemberPaywallExemptPath(pathname: string): boolean {
  if (pathname === "/profile") return true;
  return MEMBER_PAYWALL_EXEMPT_PATHS.some(
    (p) => p !== "/profile" && (pathname === p || pathname.startsWith(`${p}/`)),
  );
}

export function isExemptFromMemberPaywall(
  accountType: string | null | undefined,
  isAdmin: boolean | null | undefined,
): boolean {
  return !!isAdmin || accountType === "employer" || accountType === "admin";
}

/** Redirect / block / subscribe UX — off during Beta. */
export function shouldEnforceMemberPaywall(): boolean {
  return isPaywallEnforced();
}
