/** Server-only arcade preview / launch gate. Never import from client components. */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { isFounderUserId } from "./founderAccess";

export const ARCADE_UNLOCK_COOKIE = "arcade_preview_unlock";
export const EOD_NATIVE_PLATFORM_HEADER = "x-eod-native-platform";

/** Cookie lifetime after a successful preview password (30 days). */
const UNLOCK_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function getArcadeAccessPassword(): string {
  return (process.env.ARCADE_ACCESS_PASSWORD ?? "").trim();
}

/**
 * Kill-switch for native iOS public unlock.
 * Default on; set ARCADE_PUBLIC_ON_NATIVE_IOS=false to force founder+password everywhere.
 */
export function isArcadePublicOnNativeIosEnabled(): boolean {
  const raw = (process.env.ARCADE_PUBLIC_ON_NATIVE_IOS ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

export function isNativeIosArcadeRequest(req: NextRequest | Request): boolean {
  const value = req.headers.get(EOD_NATIVE_PLATFORM_HEADER)?.trim().toLowerCase();
  return value === "ios";
}

/** Who may open arcade routes at all (nav + API). */
export function canUseArcadePreview(
  userId: string | null | undefined,
  options?: { nativeIos?: boolean },
): boolean {
  if (!userId) return false;
  if (isFounderUserId(userId)) return true;
  if (options?.nativeIos && isArcadePublicOnNativeIosEnabled()) return true;
  return false;
}

/**
 * Founder web preview: password cookie (skipped in local development).
 * Native iOS public launch: unlocked without password when header is present.
 */
export function hasArcadeRouteAccess(
  userId: string,
  unlockCookie: string | undefined,
  options?: { nativeIos?: boolean },
): boolean {
  if (!canUseArcadePreview(userId, options)) return false;

  if (options?.nativeIos && isArcadePublicOnNativeIosEnabled()) {
    return true;
  }

  // Local dev: skip the preview password gate so founders can test arcade routes.
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
