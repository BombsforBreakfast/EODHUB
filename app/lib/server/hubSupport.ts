import "server-only";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "./rateLimit";

export function supportJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
export function supportDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Support storage is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function supportStripe() {
  // Intentionally no fallback to the legacy membership Stripe key.
  const key = process.env.STRIPE_SUPPORT_SECRET_KEY;
  const mode = process.env.HUB_SUPPORT_MODE;
  if (!key || !["test", "live"].includes(mode ?? "")) throw new Error("Support payments are not configured");
  const live = mode === "live";
  if (!(key.startsWith(live ? "sk_live_" : "sk_test_") || key.startsWith(live ? "rk_live_" : "rk_test_"))) throw new Error("Support payment mode mismatch");
  // Production must never accidentally offer test checkout to real visitors.
  if (process.env.VERCEL_ENV === "production" && !live) throw new Error("Live support payments are not enabled");
  return { stripe: new Stripe(key), live };
}
export function supportSource(request: NextRequest) {
  const secret = process.env.HUB_SUPPORT_RATE_SECRET;
  if (!secret) throw new Error("Support quota is not configured");
  const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || getClientIp(request);
  return createHmac("sha256", secret).update(`eodhub:support:${ip}`).digest("hex");
}
export function supportGuard(request: NextRequest, requireOrigin = false) {
  if (/Capacitor/i.test(request.headers.get("user-agent") ?? "")) return supportJson({ error: "Contributions are available on the website only." }, 403);
  if (requireOrigin) {
    try { if (new URL(request.headers.get("origin") ?? "").origin !== request.nextUrl.origin) throw new Error(); }
    catch { return supportJson({ error: "Please open checkout from EOD-HUB." }, 403); }
  }
  const rate = checkRateLimit(`hub-support:${getClientIp(request)}`, { limit: 40, windowMs: 60_000 });
  if (!rate.allowed) return supportJson({ error: "Please wait a minute and try again." }, 429);
}
export function supportReturnOrigin(request: NextRequest) {
  const configured = process.env.HUB_SUPPORT_SITE_URL;
  if (!configured) throw new Error("Support return URL is not configured");
  const url = new URL(configured);
  if (url.origin !== configured || url.username || url.password || (url.protocol !== "https:" && !(process.env.NODE_ENV === "development" && url.hostname === "localhost"))) throw new Error("Invalid support return URL");
  if (process.env.VERCEL_ENV === "production" && !["eod-hub.com", "www.eod-hub.com"].includes(url.hostname)) throw new Error("Invalid live support return URL");
  // Never accept a return destination supplied by a browser or Host header.
  void request;
  return url.origin;
}
