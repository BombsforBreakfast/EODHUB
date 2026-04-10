import { isFounderUser } from "./rabbitholeAccess";

export const FOUNDER_NOTIFICATIONS_V2_OVERRIDE_KEY = "founder.notifications_v2.override";

export function getNotificationsV2Default(): boolean {
  return process.env.NEXT_PUBLIC_NOTIFICATIONS_V2 !== "false";
}

export function getNotificationsV2Enabled(currentUserId: string | null | undefined): boolean {
  const envDefault = getNotificationsV2Default();
  if (typeof window === "undefined") return envDefault;
  if (!isFounderUser(currentUserId)) return envDefault;
  const override = window.localStorage.getItem(FOUNDER_NOTIFICATIONS_V2_OVERRIDE_KEY);
  if (override === "true") return true;
  if (override === "false") return false;
  return envDefault;
}

