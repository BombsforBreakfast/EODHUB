import type { NextRequest } from "next/server";
import { promotionGuard, promotionJson } from "@/app/lib/server/promotionRequests";
import { createPromotionSession, isPromotionSession, PROMOTION_SESSION_COOKIE, PROMOTION_SESSION_TTL_SECONDS } from "@/app/lib/server/promotionSession";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const error = promotionGuard(request);
  if (error) return error;
  const existing = request.cookies.get(PROMOTION_SESSION_COOKIE)?.value;
  const response = promotionJson({ ok: true });
  response.cookies.set(PROMOTION_SESSION_COOKIE, isPromotionSession(existing) ? existing : createPromotionSession(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/promote", maxAge: PROMOTION_SESSION_TTL_SECONDS,
  });
  return response;
}
