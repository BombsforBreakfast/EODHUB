import { NextResponse, type NextRequest } from "next/server";
import {
  createPromoteAccessToken,
  getPromoteAccessPassword,
  matchesPromotePassword,
  PROMOTE_ACCESS_COOKIE,
  PROMOTE_ACCESS_TTL_SECONDS,
} from "@/app/lib/server/promoteAccess";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rateLimit";

export const runtime = "nodejs";

function json(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", ...extraHeaders },
  });
}

function isSameOrigin(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    // Next can normalize the internal URL hostname to localhost. Compare the
    // browser Origin with the routed Host header, while preserving the scheme.
    return origin.host === request.headers.get("host") && origin.protocol === request.nextUrl.protocol;
  } catch {
    return false;
  }
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/promote",
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Please try again from the promotion page." }, 403);

  const rate = checkRateLimit(`promote-access:${getClientIp(request)}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!rate.allowed) {
    return json({ error: "Too many attempts. Please wait a few minutes and try again." }, 429, {
      "Retry-After": String(rate.retryAfterSec ?? 900),
    });
  }

  const password = getPromoteAccessPassword();
  if (!password) {
    return json({ error: "Access is being arranged. Please email promote@eod-hub.com for help." }, 503);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "Please enter your access password." }, 400);
  }
  if (Number(request.headers.get("content-length")) > 2048) return json({ error: "Please enter your access password." }, 413);

  let candidate: unknown;
  try {
    const body = await request.text();
    if (body.length > 2048) return json({ error: "Please enter your access password." }, 413);
    const parsed: unknown = JSON.parse(body);
    candidate = parsed && typeof parsed === "object" && "password" in parsed ? parsed.password : undefined;
  } catch {
    return json({ error: "Please enter your access password." }, 400);
  }
  if (!matchesPromotePassword(candidate, password)) {
    return json({ error: "That password didn’t match. Please try again or email us for access." }, 401);
  }

  const response = json({ ok: true });
  response.cookies.set(PROMOTE_ACCESS_COOKIE, createPromoteAccessToken(password), {
    ...cookieOptions,
    maxAge: PROMOTE_ACCESS_TTL_SECONDS,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "Please try again from the promotion page." }, 403);
  const response = json({ ok: true });
  response.cookies.set(PROMOTE_ACCESS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
