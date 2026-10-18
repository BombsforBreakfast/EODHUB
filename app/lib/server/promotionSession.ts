import { createHash, createHmac, randomBytes } from "node:crypto";

export const PROMOTION_SESSION_COOKIE = "eod_promotion_session";
export const PROMOTION_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function createPromotionSession() {
  return randomBytes(32).toString("hex");
}

export function isPromotionSession(token: string | undefined): token is string {
  return typeof token === "string" && token.length === 64 && /^[a-f0-9]+$/.test(token);
}

// This opaque bearer only owns drafts whose stored hash matches. It grants no
// member/admin access and does not provide a read API for customer submissions.
export function promotionOwner(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function promotionSource(ip: string, secret: string) {
  if (!secret) throw new Error("Promotion requests are temporarily unavailable.");
  // Keyed hashing prevents recovering raw network addresses from the quota key.
  return createHmac("sha256", secret).update(`eodhub:promotion-source:${ip}`).digest("hex");
}
