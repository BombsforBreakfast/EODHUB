import { devAuthLog } from "@/app/lib/auth/signupErrors";

/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Used by:
 *   - app/api/verify-turnstile/route.ts (legacy explicit verify endpoint)
 *   - app/api/auth/signup/route.ts      (inline verify as part of signup gate)
 *
 * Enforcement policy:
 *   - Production: secret + token REQUIRED. Missing secret => fail closed
 *     (matches the previous behavior of /api/verify-turnstile).
 *   - Non-production: if TURNSTILE_REQUIRED=true, behave like production.
 *     Otherwise, if no secret is configured, allow through so local dev
 *     and preview deploys without a Turnstile binding still work.
 *
 * The "remote IP" hint is passed to Cloudflare per their docs:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 5_000;

export type TurnstileVerifyResult =
  | { ok: true; skipped?: boolean }
  | {
      ok: false;
      reason:
        | "missing_token"
        | "missing_secret"
        | "verify_failed"
        | "network_error";
    };

type SiteverifyResponse = {
  success?: boolean;
  ["error-codes"]?: string[];
};

function isEnforced(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.TURNSTILE_REQUIRED === "true";
}

/**
 * Verify a Turnstile token. Returns a structured result. Never throws.
 *
 * @param token  The token returned by the Turnstile widget on the client.
 * @param remoteIp Optional client IP (best effort) for Cloudflare's analytics.
 */
export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const enforced = isEnforced();

  if (!secret) {
    if (enforced) {
      devAuthLog("turnstile", { step: "missing_secret_enforced" });
      return { ok: false, reason: "missing_secret" };
    }
    devAuthLog("turnstile", { step: "skipped_no_secret_dev" });
    return { ok: true, skipped: true };
  }

  const trimmed = typeof token === "string" ? token.trim() : "";
  if (!trimmed) {
    if (enforced) return { ok: false, reason: "missing_token" };
    devAuthLog("turnstile", { step: "skipped_no_token_dev" });
    return { ok: true, skipped: true };
  }

  const body: Record<string, string> = { secret, response: trimmed };
  if (remoteIp && remoteIp !== "unknown") {
    body.remoteip = remoteIp;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITEVERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as SiteverifyResponse;
    if (data?.success) return { ok: true };
    devAuthLog("turnstile", {
      step: "verify_failed",
      errors: data?.["error-codes"] ?? null,
    });
    return { ok: false, reason: "verify_failed" };
  } catch (err) {
    devAuthLog("turnstile", {
      step: "network_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
