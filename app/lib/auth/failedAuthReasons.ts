import type { SignupErrorCode } from "./signupErrors";
import type { SignupAttemptReason } from "../server/signupAttempts";

/**
 * Enum of failure reasons stored in failed_auth_reports.failure_reason.
 * Stable text values — used by the admin Failed Auth tab filters.
 */
export type FailedAuthReason =
  | "INVALID_PASSWORD"
  | "ACCOUNT_PENDING"
  | "EMAIL_NOT_FOUND"
  | "CAPTCHA_FAILED"
  | "TURNSTILE_FAILED"
  | "RATE_LIMITED"
  | "USER_NOT_VERIFIED"
  | "BETA_DENIED"
  | "EMAIL_VALIDATION_FAILED"
  | "ACCOUNT_CREATION_FAILED"
  | "PROFILE_CREATION_FAILED"
  | "OAUTH_ACCOUNT_EXISTS"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "CLIENT_VALIDATION_FAILED"
  | "UNKNOWN";

export const FAILED_AUTH_REASONS: readonly FailedAuthReason[] = [
  "INVALID_PASSWORD",
  "ACCOUNT_PENDING",
  "EMAIL_NOT_FOUND",
  "CAPTCHA_FAILED",
  "TURNSTILE_FAILED",
  "RATE_LIMITED",
  "USER_NOT_VERIFIED",
  "BETA_DENIED",
  "EMAIL_VALIDATION_FAILED",
  "ACCOUNT_CREATION_FAILED",
  "PROFILE_CREATION_FAILED",
  "OAUTH_ACCOUNT_EXISTS",
  "NETWORK_ERROR",
  "SERVER_ERROR",
  "CLIENT_VALIDATION_FAILED",
  "UNKNOWN",
] as const;

export function isFailedAuthReason(value: string): value is FailedAuthReason {
  return (FAILED_AUTH_REASONS as readonly string[]).includes(value);
}

export function mapSignupErrorCodeToFailedAuthReason(code: SignupErrorCode): FailedAuthReason {
  switch (code) {
    case "invalid_syntax":
    case "disposable_domain":
      return "EMAIL_VALIDATION_FAILED";
    case "duplicate_account":
    case "account_exists_login":
      return "ACCOUNT_CREATION_FAILED";
    case "oauth_account_exists":
      return "OAUTH_ACCOUNT_EXISTS";
    case "pending_verification":
      return "ACCOUNT_PENDING";
    case "security_check_failed":
      return "TURNSTILE_FAILED";
    case "rate_limited":
      return "RATE_LIMITED";
    case "generic":
    default:
      return "UNKNOWN";
  }
}

export function mapSignupAttemptReasonToFailedAuthReason(reason: SignupAttemptReason): FailedAuthReason {
  if (reason === "disposable_domain" || reason === "invalid_syntax") {
    return "EMAIL_VALIDATION_FAILED";
  }
  if (
    reason === "rate_limited_burst" ||
    reason === "rate_limited_velocity_ip_hour" ||
    reason === "rate_limited_velocity_ip_day" ||
    reason === "rate_limited_velocity_email_day"
  ) {
    return "RATE_LIMITED";
  }
  if (reason === "turnstile_failed" || reason === "turnstile_missing") {
    return "TURNSTILE_FAILED";
  }
  if (reason === "config_error") {
    return "SERVER_ERROR";
  }
  if (reason === "unknown_error") {
    return "UNKNOWN";
  }
  if (reason === "oauth_account_exists") {
    return "OAUTH_ACCOUNT_EXISTS";
  }
  if (reason === "supabase_duplicate_account") {
    return "ACCOUNT_CREATION_FAILED";
  }
  if (reason.startsWith("supabase_")) {
    const tail = reason.slice("supabase_".length);
    if (tail === "rate_limited") return "RATE_LIMITED";
    if (tail === "pending_verification") return "ACCOUNT_PENDING";
    return "ACCOUNT_CREATION_FAILED";
  }
  return "UNKNOWN";
}

/**
 * Map Supabase sign-in error text to a failed-auth reason.
 * Server enrichment (user_exists_in_auth lookup) may upgrade INVALID_PASSWORD
 * to EMAIL_NOT_FOUND when no matching auth.users row exists.
 */
export function mapSupabaseLoginError(rawMessage: string | undefined | null): FailedAuthReason {
  const m = (rawMessage ?? "").toLowerCase();

  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) {
    return "USER_NOT_VERIFIED";
  }
  if (m.includes("user not found")) {
    return "EMAIL_NOT_FOUND";
  }
  if (
    m.includes("invalid login credentials") ||
    m.includes("invalid_grant") ||
    m.includes("invalid credentials")
  ) {
    return "INVALID_PASSWORD";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "RATE_LIMITED";
  }
  return "INVALID_PASSWORD";
}
