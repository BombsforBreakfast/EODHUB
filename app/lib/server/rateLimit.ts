import type { NextRequest } from "next/server";

type Bucket = { count: number; windowStartMs: number };

const store = new Map<string, Bucket>();

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec?: number;
};

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now - bucket.windowStartMs >= opts.windowMs) {
    store.set(key, { count: 1, windowStartMs: now });
    return { allowed: true };
  }

  if (bucket.count >= opts.limit) {
    const retryAfterSec = Math.ceil((opts.windowMs - (now - bucket.windowStartMs)) / 1000);
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function rateLimitResponse(retryAfterSec?: number) {
  return {
    message: "Too many attempts. Please wait a few minutes and try again.",
    retryAfterSec,
  };
}
