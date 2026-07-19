/** Server-only arcade access gate. Never import from client components. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { isFounderUserId } from "./founderAccess";

export const ARCADE_UNLOCK_COOKIE = "arcade_preview_unlock";

/** Cookie lifetime after a successful preview password (30 days). Kept for rollback path. */
const UNLOCK_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function getArcadeAccessPassword(): string {
  return (process.env.ARCADE_ACCESS_PASSWORD ?? "").trim();
}

/**
 * Public arcade launch (web + mobile).
 * Default on; set ARCADE_PUBLIC=false to revert to founder+password preview.
 */
export function isArcadePubliclyEnabled(): boolean {
  const raw = (process.env.ARCADE_PUBLIC ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Who may open arcade routes at all (nav + API). */
export function canUseArcadePreview(userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (isArcadePubliclyEnabled()) return true;
  return isFounderUserId(userId);
}

/**
 * Public launch: any signed-in member is unlocked.
 * Preview rollback: founder password cookie (skipped in local development).
 */
export function hasArcadeRouteAccess(
  userId: string,
  unlockCookie: string | undefined,
): boolean {
  if (!canUseArcadePreview(userId)) return false;

  if (isArcadePubliclyEnabled()) return true;

  if (process.env.NODE_ENV === "development") return true;

  const password = getArcadeAccessPassword();
  if (!password) return false;

  return verifyArcadeUnlockCookie(unlockCookie, userId);
}

export function createArcadeUnlockCookieValue(userId: string): string {
  const expiresAt = Date.now() + UNLOCK_MAX_AGE_SEC * 1000;
  const payload = `${userId}.${expiresAt}`;
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

export function verifyArcadeUnlockCookie(token: string | undefined, userId: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;

  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const payload = `${uid}.${expStr}`;
  const expected = signPayload(payload);

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function arcadeUnlockCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: UNLOCK_MAX_AGE_SEC,
  };
}

export function isArcadeAccessPasswordValid(password: string): boolean {
  const expected = getArcadeAccessPassword();
  if (!expected) return false;

  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function signPayload(payload: string): string {
  const secret = getArcadeAccessPassword();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
