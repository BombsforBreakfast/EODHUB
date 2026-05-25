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

export type FailedLoginSeverity = "low" | "medium" | "high";
export type FailedLoginWaitlistStatus = "in_waitlist" | "not_in_waitlist" | "unknown";

export type FailedLoginClassification = {
  reviewable: boolean;
  suspicious: boolean;
  severity: FailedLoginSeverity;
  adminCanOverride: boolean;
  displayReason: string;
};

export function isFailedAuthReason(value: string): value is FailedAuthReason {
  return (FAILED_AUTH_REASONS as readonly string[]).includes(value);
}

export function classifyFailedLoginAttempt({
  reason,
  waitlistStatus,
  authExists,
  profileExists,
  attemptCount,
  riskLevel,
}: {
  email?: string | null;
  ip?: string | null;
  reason: FailedAuthReason | string;
  waitlistStatus?: FailedLoginWaitlistStatus | null;
  authExists?: boolean | null;
  profileExists?: boolean | null;
  attemptCount?: number | null;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | null;
}): FailedLoginClassification {
  const highVelocity = (attemptCount ?? 0) >= 5 || riskLevel === "HIGH";

  if (reason === "EMAIL_NOT_FOUND") {
    if (highVelocity) {
      return {
        reviewable: true,
        suspicious: true,
        severity: "high",
        adminCanOverride: true,
        displayReason:
          "No account exists yet. This group has high attempt volume, but admin may approve and create access.",
      };
    }

    return {
      reviewable: true,
      suspicious: false,
      severity: riskLevel === "MEDIUM" ? "medium" : "low",
      adminCanOverride: true,
      displayReason: "No account exists yet. Admin may approve and create access.",
    };
  }

  if (reason === "EMAIL_VALIDATION_FAILED") {
    return {
      reviewable: true,
      suspicious: true,
      severity: "high",
      adminCanOverride: false,
      displayReason:
        "Email validation failed. Treat disposable, invalid, or fake domains as suspicious before granting access.",
    };
  }

  if (
    reason === "RATE_LIMITED" ||
    reason === "TURNSTILE_FAILED" ||
    reason === "CAPTCHA_FAILED"
  ) {
    return {
      reviewable: true,
      suspicious: true,
      severity: riskLevel === "LOW" ? "medium" : "high",
      adminCanOverride: false,
      displayReason:
        "Security controls flagged this attempt. Resolve the abuse signal before approving access.",
    };
  }

  if (reason === "ACCOUNT_PENDING" || reason === "USER_NOT_VERIFIED") {
    return {
      reviewable: true,
      suspicious: false,
      severity: "medium",
      adminCanOverride: true,
      displayReason:
        "An account exists but is not fully verified. Admin may approve access after review.",
    };
  }

  if (
    reason === "ACCOUNT_CREATION_FAILED" &&
    authExists === false &&
    profileExists === false
  ) {
    return {
      reviewable: true,
      suspicious: false,
      severity: "medium",
      adminCanOverride: true,
      displayReason:
        "Account creation did not finish. Admin may create access if the request is legitimate.",
    };
  }

  const waitlistContext =
    waitlistStatus === "in_waitlist"
      ? " The email is on the waitlist."
      : waitlistStatus === "not_in_waitlist"
        ? " The email is not on the waitlist; that is context only."
        : "";

  return {
    reviewable: true,
    suspicious: false,
    severity: riskLevel === "HIGH" ? "high" : riskLevel === "MEDIUM" ? "medium" : "low",
    adminCanOverride: true,
    displayReason: `Review the failed sign-in context before taking action.${waitlistContext}`,
  };
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
