import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rateLimit";
import {
  FAILED_AUTH_REASONS,
  isFailedAuthReason,
  type FailedAuthReason,
} from "@/app/lib/auth/failedAuthReasons";
import { logFailedAuthAttempt } from "@/app/lib/server/logFailedAuthAttempt";

export const dynamic = "force-dynamic";

const ALWAYS_OK = NextResponse.json({ ok: true });
const MAX_RAW = 500;
const MAX_EMAIL = 320;
const MAX_ROUTE = 200;
const MAX_ERROR_CODE = 120;

/**
 * Client-side failure report endpoint.
 *
 * Login fails client-side (no server route for signInWithPassword), so the
 * login page POSTs here to give admins visibility into bad-password attempts,
 * unknown emails, network issues, etc.
 *
 * Always returns 200 ok:true (even on internal failure or unknown reason) so
 * auth UX never depends on this endpoint. The endpoint is unauthenticated by
 * design — the caller is, by definition, failing to authenticate.
 *
 * Hard guarantees:
 *   - Rate-limited per IP (10 per 15 min)
 *   - Rejects passwords / tokens / captcha tokens
 *   - Never throws, never blocks
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`report-failure:${ip}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) return ALWAYS_OK;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ALWAYS_OK;
  }
  if (!body || typeof body !== "object") return ALWAYS_OK;

  const record = body as Record<string, unknown>;

  // Defense in depth: never log credentials / tokens, even if the client sends them.
  for (const sensitiveKey of ["password", "token", "turnstileToken", "captchaToken", "session", "access_token", "refresh_token"]) {
    if (sensitiveKey in record) {
      delete record[sensitiveKey];
    }
  }

  const reasonRaw = typeof record.failureReason === "string" ? record.failureReason : "";
  if (!isFailedAuthReason(reasonRaw)) {
    // Unknown reason — fall back to UNKNOWN, still log so we can spot client bugs.
    void logFailedAuthAttempt({
      failureReason: "UNKNOWN",
      emailAttempted: typeof record.email === "string" ? record.email.slice(0, MAX_EMAIL) : null,
      sourceRoute: typeof record.sourceRoute === "string" ? record.sourceRoute.slice(0, MAX_ROUTE) : "/login",
      errorCode: `unknown_reason:${reasonRaw.slice(0, 40)}`,
      request: req,
    });
    return ALWAYS_OK;
  }

  const failureReason = reasonRaw as FailedAuthReason;
  const emailAttempted = typeof record.email === "string" ? record.email.slice(0, MAX_EMAIL) : null;
  const errorCode = typeof record.errorCode === "string" ? record.errorCode.slice(0, MAX_ERROR_CODE) : null;
  const rawErrorMessage =
    typeof record.rawErrorMessage === "string" ? record.rawErrorMessage.slice(0, MAX_RAW) : null;
  const sourceRoute =
    typeof record.sourceRoute === "string" ? record.sourceRoute.slice(0, MAX_ROUTE) : "/login";

  void logFailedAuthAttempt({
    emailAttempted,
    failureReason,
    errorCode,
    rawErrorMessage,
    sourceRoute,
    request: req,
  });

  return ALWAYS_OK;
}

// Exported for callers/tests that need to know which reasons the endpoint accepts.
export { FAILED_AUTH_REASONS };
