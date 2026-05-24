/**
 * Centralized signup / auth error codes and public-facing messages.
 * Never expose raw Supabase or internal error strings in the UI.
 */

export type SignupErrorCode =
  | "invalid_syntax"
  | "disposable_domain"
  | "duplicate_account"
  | "account_exists_login"
  | "pending_verification"
  | "security_check_failed"
  | "rate_limited"
  | "generic";

/** Internal telemetry only — not shown to users. */
export type SignupErrorCodeInternal = SignupErrorCode | "mx_timeout" | "mx_no_records";

export const SIGNUP_USER_MESSAGES: Record<
  Exclude<SignupErrorCode, "disposable_domain">,
  string
> = {
  invalid_syntax: "Please enter a valid email address.",
  duplicate_account: "An account with this email already exists.",
  account_exists_login:
    "An account with this email already exists. Please log in to continue setting up your account.",
  pending_verification:
    "Your account is currently pending verification and approval.",
  security_check_failed:
    "Security check failed. Please try again or use Sign up with Google.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  generic: "Unable to create account. Please try again.",
};

/** Shown when sign-in fails — does not reveal whether the email is registered. */
export const LOGIN_FAILED_MESSAGE =
  "Unable to sign in. Check your email and password, or create an account.";

/** Public message for a signup/auth error code. */
export function userMessageForSignupCode(code: SignupErrorCode | string | undefined): string {
  if (code === "invalid_syntax") return SIGNUP_USER_MESSAGES.invalid_syntax;
  if (code === "duplicate_account") return SIGNUP_USER_MESSAGES.duplicate_account;
  if (code === "account_exists_login") return SIGNUP_USER_MESSAGES.account_exists_login;
  if (code === "pending_verification") return SIGNUP_USER_MESSAGES.pending_verification;
  if (code === "security_check_failed") return SIGNUP_USER_MESSAGES.security_check_failed;
  if (code === "rate_limited") return SIGNUP_USER_MESSAGES.rate_limited;
  if (code === "disposable_domain") return SIGNUP_USER_MESSAGES.generic;
  return SIGNUP_USER_MESSAGES.generic;
}

export function mapEmailValidationCode(
  code: "invalid" | "fake",
): SignupErrorCode {
  return code === "fake" ? "disposable_domain" : "invalid_syntax";
}

/** Map Supabase Auth signUp / signIn errors to a safe public code. */
export function mapSupabaseAuthError(message: string): SignupErrorCode {
  const m = message.toLowerCase();
  if (
    m.includes("already registered") ||
    m.includes("already exists") ||
    m.includes("user already registered") ||
    m.includes("email address is already") ||
    m.includes("duplicate")
  ) {
    return "duplicate_account";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "rate_limited";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "invalid_syntax";
  }
  return "generic";
}

export type ValidateEmailApiBody = {
  ok?: boolean;
  code?: string;
  message?: string;
  email?: string;
};

export function codeFromValidateEmailResponse(
  res: Response,
  body: ValidateEmailApiBody,
): SignupErrorCode {
  if (res.status === 429) return "rate_limited";
  if (body.code && isSignupErrorCode(body.code)) return body.code;
  return "generic";
}

function isSignupErrorCode(code: string): code is SignupErrorCode {
  return (
    code === "invalid_syntax" ||
    code === "disposable_domain" ||
    code === "duplicate_account" ||
    code === "account_exists_login" ||
    code === "pending_verification" ||
    code === "security_check_failed" ||
    code === "rate_limited" ||
    code === "generic"
  );
}

/** Dev-only auth logging — never pass passwords, tokens, or JWTs. */
export function devAuthLog(
  tag: string,
  data: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[auth:${tag}]`, data);
  }
}
