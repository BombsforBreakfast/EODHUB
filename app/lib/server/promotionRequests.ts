import "server-only";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isPromotionSession, promotionOwner, PROMOTION_SESSION_COOKIE } from "./promotionSession";
import { checkRateLimit, getClientIp } from "./rateLimit";

export const PROMOTION_BUCKET = "promotion-materials";
export function promotionJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
export function promotionDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Promotion requests are temporarily unavailable. Please try again later.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function promotionClientIp(request: NextRequest) {
  // Vercel supplies its trusted proxy address, even when another proxy is used.
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || getClientIp(request);
}
export function promotionGuard(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.host !== request.headers.get("host") || origin.protocol !== request.nextUrl.protocol) throw new Error();
  } catch { return promotionJson({ error: "Please submit from the promotion page." }, 403); }
  const rate = checkRateLimit(`promotion:${promotionClientIp(request)}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    const response = promotionJson({ error: "Too many attempts. Please try again later." }, 429);
    response.headers.set("Retry-After", String(rate.retryAfterSec ?? 3600));
    return response;
  }
}
export function promotionAccess(request: NextRequest) {
  const error = promotionGuard(request);
  if (error) return { error };
  const token = request.cookies.get(PROMOTION_SESSION_COOKIE)?.value;
  if (!isPromotionSession(token)) return { error: promotionJson({ error: "Your private form session expired. Please allow cookies and retry your submission." }, 401) };
  return { owner: promotionOwner(token) };
}
export async function readPromotionJson(request: NextRequest, max = 64000): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Please submit the form again.");
  const text = await readLimitedBody(request, max);
  return JSON.parse(text.toString("utf8"));
}
// Bound actual bytes, including chunked requests without a Content-Length.
export async function readLimitedBody(request: NextRequest, max: number) {
  if (Number(request.headers.get("content-length")) > max || !request.body) throw new Error("This upload is too large.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel(); throw new Error("This upload is too large."); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
