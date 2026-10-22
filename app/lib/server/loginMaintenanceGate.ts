/** Server-only login maintenance gate. Never import from client components. */

import { createHmac, timingSafeEqual } from "node:crypto";

export const LOGIN_MAINTENANCE_COOKIE = "eod_login_maint_bypass";

const UNLOCK_MAX_AGE_SEC = 60 * 60 * 12; // 12 hours

/**
 * Optional login-screen maintenance overlay.
 * Enable with LOGIN_MAINTENANCE_GATE=true (or 1/on/yes).
 */
export function isLoginMaintenanceGateEnabled(): boolean {
  const raw = (process.env.LOGIN_MAINTENANCE_GATE ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export function getLoginMaintenancePassword(): string {
  return (process.env.LOGIN_MAINTENANCE_PASSWORD ?? "bombsforbreakfast").trim();
}

export function isLoginMaintenancePasswordValid(password: string): boolean {
  const expected = getLoginMaintenancePassword();
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

export function createLoginMaintenanceUnlockCookie(): string {
  const expiresAt = Date.now() + UNLOCK_MAX_AGE_SEC * 1000;
  const payload = `ok.${expiresAt}`;
  return `${payload}.${signPayload(payload)}`;
}

export function verifyLoginMaintenanceUnlockCookie(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [flag, expStr, sig] = parts;
  if (flag !== "ok") return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const payload = `${flag}.${expStr}`;
  const expected = signPayload(payload);
  // Security Enhancement: Fail securely to prevent authentication bypass on empty signatures.
  if (!expected) return false;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function loginMaintenanceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: UNLOCK_MAX_AGE_SEC,
  };
}

function signPayload(payload: string): string {
  const secret = getLoginMaintenancePassword();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
