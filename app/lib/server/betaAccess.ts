import { NextRequest, NextResponse } from "next/server";

/** HttpOnly cookie — set only after successful POST /api/validate-beta. */
export const BETA_ACCESS_COOKIE = "eod_beta_access";

/** ~30 days — beta-period remember; avoids re-prompting on refresh/return visits. */
export const BETA_ACCESS_MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** Server-only — never import from client components. */
export function getBetaAccessCode(): string {
  return (process.env.BETA_ACCESS_CODE ?? "").trim();
}

export function isBetaAccessGranted(req: NextRequest): boolean {
  return req.cookies.get(BETA_ACCESS_COOKIE)?.value === "1";
}

export function jsonWithBetaAccessCookie<T extends Record<string, unknown>>(
  body: T,
  init?: { status?: number },
): NextResponse {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  res.cookies.set(BETA_ACCESS_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BETA_ACCESS_MAX_AGE_SEC,
  });
  return res;
}
