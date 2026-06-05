/** Case-insensitive marker for the retired public beta access code. */
const BETA_ACCESS_CODE_MARKER = "eodhubbeta";

/**
 * True when the password field contains the retired public beta code
 * (EODHUBBETA), ignoring case and optional asterisks.
 */
export function passwordContainsBetaAccessCode(
  password: string | null | undefined,
): boolean {
  if (typeof password !== "string" || !password.trim()) return false;
  const normalized = password.replace(/\*/g, "").toLowerCase();
  return normalized.includes(BETA_ACCESS_CODE_MARKER);
}

export const BETA_CODE_AS_PASSWORD_HELPER_MESSAGE =
  "EOD beta code no longer active. Please sign up via Google or sign up to create account.";
