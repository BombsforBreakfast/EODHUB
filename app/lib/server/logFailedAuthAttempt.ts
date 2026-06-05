import type { NextRequest } from "next/server";
import {
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import type { FailedAuthReason } from "@/app/lib/auth/failedAuthReasons";
import { mapSupabaseLoginError } from "@/app/lib/auth/failedAuthReasons";
import { devAuthLog } from "@/app/lib/auth/signupErrors";

/**
 * Fire-and-forget logger for failed auth attempts. Used by signup, login
 * (via /api/auth/report-failure), OAuth callback, and others.
 *
 * Never throws. Auth flows must never block on this — call sites should
 * always invoke as `void logFailedAuthAttempt(...)`.
 *
 * Behavior:
 *   1. Normalizes email (lowercase + trim) and preserves the raw attempt.
 *   2. Extracts IP from x-forwarded-for / cf-connecting-ip / x-real-ip.
 *   3. Generates a request_id (uuid) for cross-referencing server logs.
 *   4. When called without explicit existence flags, enriches by looking up
 *      auth.users + profiles via service role.
 *   5. Computes a simple risk_level (LOW / MEDIUM / HIGH) based on how
 *      many matching rows exist in the last hour for the same IP / email.
 *   6. Inserts into failed_auth_reports via service role. Swallows insert
 *      errors with a dev-only log.
 */

const MAX_EMAIL = 320;
const MAX_UA = 256;
const MAX_IP = 64;
const MAX_RAW = 500;
const MAX_ROUTE = 200;
const MAX_ERROR_CODE = 120;
const MAX_TURNSTILE_STATUS = 64;
const ONE_HOUR_MS = 60 * 60 * 1000;

export type LogFailedAuthAttemptInput = {
  emailAttempted?: string | null;
  failureReason: FailedAuthReason;
  errorCode?: string | null;
  rawErrorMessage?: string | null;
  sourceRoute?: string | null;
  request?: Request | NextRequest | null;
  turnstileStatus?: string | null;
  turnstileError?: string | null;
  userExistsInAuth?: boolean | null;
  userExistsInProfiles?: boolean | null;
  verificationStatus?: string | null;
};

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function clamp(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return t || null;
}

function extractIp(request: Request | NextRequest | null | undefined): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return clamp(first, MAX_IP);
  }
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return clamp(cf, MAX_IP);
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return clamp(realIp, MAX_IP);
  return null;
}

function extractUserAgent(request: Request | NextRequest | null | undefined): string | null {
  if (!request) return null;
  return clamp(request.headers.get("user-agent"), MAX_UA);
}

type Enriched = {
  userExistsInAuth: boolean | null;
  userExistsInProfiles: boolean | null;
  verificationStatus: string | null;
};

async function enrichAuthContext(normalizedEmailValue: string | null): Promise<Enriched> {
  if (!normalizedEmailValue) {
    return { userExistsInAuth: null, userExistsInProfiles: null, verificationStatus: null };
  }
  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    return { userExistsInAuth: null, userExistsInProfiles: null, verificationStatus: null };
  }
  try {
    const { users } = await findAuthUsersByEmail(client, normalizedEmailValue);
    const authUser = users[0] ?? null;
    if (!authUser) {
      return { userExistsInAuth: false, userExistsInProfiles: false, verificationStatus: null };
    }
    const { data: profile } = await client
      .from("profiles")
      .select("verification_status")
      .eq("user_id", authUser.id)
      .maybeSingle();
    return {
      userExistsInAuth: true,
      userExistsInProfiles: profile != null,
      verificationStatus:
        typeof profile?.verification_status === "string" ? profile.verification_status : null,
    };
  } catch {
    return { userExistsInAuth: null, userExistsInProfiles: null, verificationStatus: null };
  }
}

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>["client"]>;

async function countRecentMatches(
  client: ServiceClient,
  sinceIso: string,
  field: "ip_address" | "normalized_email",
  value: string,
): Promise<number> {
  try {
    const { count, error } = await client
      .from("failed_auth_reports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso)
      .eq(field, value);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

function computeRiskLevel(args: {
  failureReason: FailedAuthReason;
  ipCount: number;
  emailCount: number;
  userExistsInAuth: boolean | null;
  userExistsInProfiles: boolean | null;
}): { riskLevel: RiskLevel; attemptCount: number } {
  const attemptCount = Math.max(args.ipCount, args.emailCount) + 1;

  if (
    args.failureReason === "ACCOUNT_CREATION_FAILED" &&
    args.userExistsInAuth === false &&
    args.userExistsInProfiles === false
  ) {
    return { riskLevel: "HIGH", attemptCount };
  }

  if (args.ipCount >= 4 || args.emailCount >= 4) {
    return { riskLevel: "HIGH", attemptCount };
  }

  if (
    (args.failureReason === "TURNSTILE_FAILED" || args.failureReason === "CAPTCHA_FAILED") &&
    args.ipCount >= 2
  ) {
    return { riskLevel: "HIGH", attemptCount };
  }

  if (args.ipCount >= 1 || args.emailCount >= 1) {
    return { riskLevel: "MEDIUM", attemptCount };
  }

  return { riskLevel: "LOW", attemptCount };
}

function resolveFailureReason(
  input: LogFailedAuthAttemptInput,
  enriched: { userExistsInAuth: boolean | null; userExistsInProfiles: boolean | null },
): FailedAuthReason {
  const reason = input.failureReason;

  if (reason === "INVALID_PASSWORD" && enriched.userExistsInAuth === false) {
    return "EMAIL_NOT_FOUND";
  }

  if (
    reason === "ACCOUNT_PENDING" &&
    enriched.userExistsInAuth === false &&
    enriched.userExistsInProfiles === false
  ) {
    return "ACCOUNT_CREATION_FAILED";
  }

  if (reason === "UNKNOWN" && input.rawErrorMessage) {
    const mapped = mapSupabaseLoginError(input.rawErrorMessage);
    if (mapped !== "INVALID_PASSWORD") return mapped;
  }

  return reason;
}

export async function logFailedAuthAttempt(input: LogFailedAuthAttemptInput): Promise<void> {
  const requestId = crypto.randomUUID();
  const normalizedEmailValue = normalizeEmail(input.emailAttempted);
  const emailAttempted = clamp(input.emailAttempted, MAX_EMAIL);
  const ipAddress = extractIp(input.request ?? null);
  const userAgent = extractUserAgent(input.request ?? null);

  try {
    let userExistsInAuth = input.userExistsInAuth ?? null;
    let userExistsInProfiles = input.userExistsInProfiles ?? null;
    let verificationStatus = input.verificationStatus ?? null;

    const needsEnrich =
      normalizedEmailValue &&
      (userExistsInAuth === null ||
        userExistsInProfiles === null ||
        verificationStatus === null);

    if (needsEnrich) {
      const enriched = await enrichAuthContext(normalizedEmailValue);
      if (userExistsInAuth === null) userExistsInAuth = enriched.userExistsInAuth;
      if (userExistsInProfiles === null) userExistsInProfiles = enriched.userExistsInProfiles;
      if (verificationStatus === null) verificationStatus = enriched.verificationStatus;
    }

    const failureReason = resolveFailureReason(input, {
      userExistsInAuth,
      userExistsInProfiles,
    });

    const { client, error: envErr } = createSupabaseServiceRoleClient();
    if (envErr || !client) {
      devAuthLog("failed-auth-report", { step: "missing_service_role", requestId });
      return;
    }

    const sinceIso = new Date(Date.now() - ONE_HOUR_MS).toISOString();
    let ipCount = 0;
    let emailCount = 0;
    if (ipAddress) {
      ipCount = await countRecentMatches(client, sinceIso, "ip_address", ipAddress);
    }
    if (normalizedEmailValue) {
      emailCount = await countRecentMatches(client, sinceIso, "normalized_email", normalizedEmailValue);
    }

    const { riskLevel, attemptCount } = computeRiskLevel({
      failureReason,
      ipCount,
      emailCount,
      userExistsInAuth,
      userExistsInProfiles,
    });

    const row = {
      email_attempted: emailAttempted,
      normalized_email: normalizedEmailValue,
      ip_address: ipAddress,
      user_agent: userAgent,
      source_route: clamp(input.sourceRoute, MAX_ROUTE),
      failure_reason: failureReason,
      error_code: clamp(input.errorCode, MAX_ERROR_CODE),
      raw_error_message: clamp(input.rawErrorMessage, MAX_RAW),
      turnstile_status: clamp(input.turnstileStatus, MAX_TURNSTILE_STATUS),
      turnstile_error: clamp(input.turnstileError, MAX_RAW),
      user_exists_in_auth: userExistsInAuth,
      user_exists_in_profiles: userExistsInProfiles,
      verification_status: verificationStatus,
      request_id: requestId,
      attempt_count: attemptCount,
      risk_level: riskLevel,
    };

    const { error } = await client.from("failed_auth_reports").insert(row);
    if (error) {
      devAuthLog("failed-auth-report", {
        step: "insert_failed",
        requestId,
        error: error.message,
      });
      return;
    }

    devAuthLog("failed-auth-report", {
      requestId,
      failureReason,
      riskLevel,
      sourceRoute: row.source_route,
    });

    if (riskLevel === "HIGH" && process.env.NODE_ENV === "production") {
      console.warn(
        `[auth-failed-report] request_id=${requestId} reason=${failureReason} risk=${riskLevel} email=${normalizedEmailValue ?? "—"} ip=${ipAddress ?? "—"}`,
      );
    }
  } catch (err) {
    devAuthLog("failed-auth-report", {
      step: "unexpected_error",
      requestId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
