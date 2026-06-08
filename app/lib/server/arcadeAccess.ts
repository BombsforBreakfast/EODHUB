/** Server-only arcade preview gate. Never import from client components. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { isFounderUserId } from "./founderAccess";

export const ARCADE_UNLOCK_COOKIE = "arcade_preview_unlock";

/** Cookie lifetime after a successful preview password (30 days). */
const UNLOCK_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function getArcadeAccessPassword(): string {
  return (process.env.ARCADE_ACCESS_PASSWORD ?? "").trim();
}

/** Nav + route eligibility: founder account or site admin. */
export function canUseArcadePreview(userId: string | null | undefined, isAdmin: boolean): boolean {
  if (!userId) return false;
  if (isAdmin) return true;
  return isFounderUserId(userId);
}

/** Admins enter without the preview password; founder must unlock once per cookie lifetime. */
export function hasArcadeRouteAccess(
  userId: string,
  isAdmin: boolean,
  unlockCookie: string | undefined,
): boolean {
  if (!canUseArcadePreview(userId, isAdmin)) return false;
  if (isAdmin) return true;

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
