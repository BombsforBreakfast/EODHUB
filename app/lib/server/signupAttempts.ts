import { createHash } from "crypto";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { devAuthLog } from "@/app/lib/auth/signupErrors";

/**
 * Persisted signup attempt logging + velocity rate limiting.
 *
 * The signup_attempts table stores one row per signup attempt that reaches
 * /api/auth/signup (or /api/auth/validate-email) — allowed or blocked. We
 * never store raw email addresses; only a SHA-256 hash of the normalized
 * email is persisted so we can detect repeated attempts without retaining
 * attacker PII. The plaintext domain is kept for abuse-pattern analysis.
 */

export type SignupAttemptReason =
  | "disposable_domain"
  | "invalid_syntax"
  | "rate_limited_burst"
  | "rate_limited_velocity_ip_hour"
  | "rate_limited_velocity_ip_day"
  | "rate_limited_velocity_email_day"
  | "turnstile_failed"
  | "turnstile_missing"
  | `supabase_${string}`
  | "config_error"
  | "unknown_error";

export type SignupAttemptInput = {
  ip: string | null;
  userAgent: string | null;
  email: string | null;
  domain: string | null;
};

export type SignupAttemptAllowed = SignupAttemptInput & {
  supabaseUserId: string | null;
};

export type SignupAttemptBlocked = SignupAttemptInput & {
  reason: SignupAttemptReason;
};

const MAX_UA = 256;
const MAX_IP = 64;
const SIGNUP_RATE_LIMIT_EXEMPT_EMAILS: ReadonlySet<string> = Object.freeze(
  new Set<string>([
    "brandedapparelcompany@gmail.com",
  ]),
);

function clamp(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizeEmail(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  return t || null;
}

export function isSignupRateLimitExemptEmail(value: string | null): boolean {
  const norm = normalizeEmail(value);
  return Boolean(norm && SIGNUP_RATE_LIMIT_EXEMPT_EMAILS.has(norm));
}

/** SHA-256 of a normalized email. Returns null for empty input. */
export function hashEmail(value: string | null): string | null {
  const norm = normalizeEmail(value);
  if (!norm) return null;
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

function getDomain(email: string | null, fallback: string | null): string | null {
  const norm = normalizeEmail(email);
  if (norm && norm.includes("@")) {
    const d = norm.split("@")[1]?.trim().toLowerCase();
    if (d) return d;
  }
  return fallback ? fallback.trim().toLowerCase() || null : null;
}

async function insertRow(row: Record<string, unknown>): Promise<void> {
  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    devAuthLog("signup-attempts", { step: "missing_service_role" });
    return;
  }
  const { error } = await client.from("signup_attempts").insert(row);
  if (error) {
    devAuthLog("signup-attempts", { step: "insert_failed", error: error.message });
  }
}

/** Record an allowed signup. Fire-and-forget; never throws. */
export async function logAllowed(input: SignupAttemptAllowed): Promise<void> {
  try {
    await insertRow({
      ip: clamp(input.ip, MAX_IP),
      user_agent: clamp(input.userAgent, MAX_UA),
      email_hash: hashEmail(input.email),
      email_domain: getDomain(input.email, input.domain),
      outcome: "allowed",
      reason: null,
      supabase_user_id: input.supabaseUserId,
    });
  } catch (err) {
    devAuthLog("signup-attempts", {
      step: "log_allowed_error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Record a blocked signup attempt. Fire-and-forget; never throws. */
export async function logBlocked(input: SignupAttemptBlocked): Promise<void> {
  try {
    await insertRow({
      ip: clamp(input.ip, MAX_IP),
      user_agent: clamp(input.userAgent, MAX_UA),
      email_hash: hashEmail(input.email),
      email_domain: getDomain(input.email, input.domain),
      outcome: "blocked",
      reason: input.reason,
      supabase_user_id: null,
    });
  } catch (err) {
    devAuthLog("signup-attempts", {
      step: "log_blocked_error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type VelocityResult =
  | { ok: true }
  | { ok: false; reason: SignupAttemptReason };

/** Defaults tuned to be invisible to humans but strict against scripts. */
export const VELOCITY_LIMITS = {
  /** Max signups (allowed OR blocked) from one IP in the last hour. */
  ipPerHour: 5,
  /** Max signups (allowed OR blocked) from one IP in the last 24h. */
  ipPerDay: 20,
  /** Max attempts against one email address in the last 24h, any IP. */
  emailPerDay: 3,
} as const;

/**
 * Check whether the current signup attempt is within velocity limits.
 *
 * Counts both `allowed` and `blocked` rows so attackers cannot use repeated
 * blocked attempts to mask further allowed ones, and so that a single bot
 * cannot keep retrying invalid emails for free.
 */
export async function checkSignupVelocity(args: {
  ip: string | null;
  email: string | null;
}): Promise<VelocityResult> {
  const ip = clamp(args.ip, MAX_IP);
  const emailHash = hashEmail(args.email);

  if (isSignupRateLimitExemptEmail(args.email)) {
    devAuthLog("signup-velocity", { step: "exempt_email" });
    return { ok: true };
  }

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    // Fail open if env is misconfigured — we don't want to lock out signups,
    // but we DO want this surfaced (also logged in createSupabaseServiceRoleClient
    // caller paths). The burst-RL in /api/auth/signup is the safety net here.
    devAuthLog("signup-velocity", { step: "missing_service_role" });
    return { ok: true };
  }

  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  if (ip) {
    const { count: hourCount, error: hourErr } = await client
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneHourAgo);
    if (hourErr) {
      devAuthLog("signup-velocity", { step: "ip_hour_query_error", error: hourErr.message });
    } else if ((hourCount ?? 0) >= VELOCITY_LIMITS.ipPerHour) {
      return { ok: false, reason: "rate_limited_velocity_ip_hour" };
    }

    const { count: dayCount, error: dayErr } = await client
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", oneDayAgo);
    if (dayErr) {
      devAuthLog("signup-velocity", { step: "ip_day_query_error", error: dayErr.message });
    } else if ((dayCount ?? 0) >= VELOCITY_LIMITS.ipPerDay) {
      return { ok: false, reason: "rate_limited_velocity_ip_day" };
    }
  }

  if (emailHash) {
    const { count, error } = await client
      .from("signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email_hash", emailHash)
      .gte("created_at", oneDayAgo);
    if (error) {
      devAuthLog("signup-velocity", { step: "email_day_query_error", error: error.message });
    } else if ((count ?? 0) >= VELOCITY_LIMITS.emailPerDay) {
      return { ok: false, reason: "rate_limited_velocity_email_day" };
    }
  }

  return { ok: true };
}
