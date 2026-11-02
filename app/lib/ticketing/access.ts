export const TICKETING_ROLE = "eod_ticketing";
export const TICKETING_COOKIE = "eod_ticketing_pilot";
export const TICKETING_ROOT = "/ticketing";
export type Assignment = { id: string; event_id: string; user_id: string; role: "coordinator" | "checkin_staff"; expires_at: string | null; revoked_at: string | null };

export function activeAssignment(row: Assignment, now = Date.now()) {
  return !row.revoked_at && (row.expires_at === null ? row.role === "coordinator" : Date.parse(row.expires_at) > now);
}
export function assignedAccess(assignments: Assignment[], userId: string, eventId: string, scan = false, now = Date.now()) {
  return assignments.some(row => row.user_id === userId && row.event_id === eventId && activeAssignment(row, now) && (scan || row.role === "coordinator"));
}
export function ticketingOrigin(env: NodeJS.ProcessEnv = process.env) {
  if (env.TICKETING_PILOT_ENABLED !== "1" || env.VERCEL_ENV === "production") return null;
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    return host && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(host) ? `https://${host}` : null;
  }
  if (env.NODE_ENV !== "development" || !env.TICKETING_PILOT_ORIGIN) return null;
  try {
    const url = new URL(env.TICKETING_PILOT_ORIGIN);
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.username && !url.password) return url.origin;
  } catch { /* Invalid deployment configuration leaves ticketing disabled. */ }
  return null;
}
export function isTicketingIdentity(user: { role?: string; app_metadata?: Record<string, unknown> } | null | undefined) {
  return user?.role === TICKETING_ROLE && user.app_metadata?.account_type === "ticketing_customer";
}
export function ticketingApiAllowed(path: string) { return path === "/api/ticketing" || path.startsWith("/api/ticketing/"); }
/** Deny-only hint. Never use unverified claims to grant access. */
export function bearerClaimsTicketing(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  try { return JSON.parse(Buffer.from(value.slice(7).split(".")[1], "base64url").toString()).role === TICKETING_ROLE; } catch { return false; }
}
export function ticketingEmail(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
