import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getPromoteAccessPassword, hasPromoteAccess, PROMOTE_ACCESS_COOKIE } from "./promoteAccess";
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
export function promotionAccess(request: NextRequest) {
  const token = request.cookies.get(PROMOTE_ACCESS_COOKIE)?.value;
  if (!hasPromoteAccess(token, getPromoteAccessPassword())) return { error: promotionJson({ error: "Your advertiser access expired. Unlock the promotion page again; your form is still here." }, 401) };
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.host !== request.headers.get("host") || origin.protocol !== request.nextUrl.protocol) throw new Error();
  } catch { return { error: promotionJson({ error: "Please submit from the promotion page." }, 403) }; }
  const rate = checkRateLimit(`promotion:${getClientIp(request)}`, { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return { error: promotionJson({ error: "Too many attempts. Please try again later." }, 429) };
  return { owner: createHash("sha256").update(token!).digest("hex") };
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
