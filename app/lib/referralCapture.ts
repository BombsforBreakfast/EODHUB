/**
 * First-touch referral capture: ?ref= from any page → cookie + localStorage.
 * Used at signup/onboarding so invite links auto-populate the referral field.
 */

export const REFERRAL_STORAGE_KEY = "eod_ref";
export const REFERRAL_COOKIE_NAME = "eod_ref";
const REFERRAL_COOKIE_MAX_AGE_SEC = 90 * 24 * 60 * 60; // 90 days
const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{1,12}$/;

function normalizeReferralCode(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const code = raw.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(code) ? code : null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function writeCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

function readLocalStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeLocalStorage(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REFERRAL_STORAGE_KEY, code);
  } catch {
    /* quota / private mode */
  }
}

function persistReferralCode(code: string): void {
  writeLocalStorage(code);
  writeCookie(REFERRAL_COOKIE_NAME, code, REFERRAL_COOKIE_MAX_AGE_SEC);
}

/** Returns stored referral code from localStorage or cookie (normalized). */
export function readStoredReferral(): string | null {
  return readLocalStorage() ?? normalizeReferralCode(readCookie(REFERRAL_COOKIE_NAME));
}

/** First-touch: capture ?ref= from current URL if nothing stored yet. */
export function captureReferralFromUrl(): string | null {
  if (typeof window === "undefined") return readStoredReferral();

  const fromUrl = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
  const existing = readStoredReferral();

  if (fromUrl && !existing) {
    persistReferralCode(fromUrl);
    return fromUrl;
  }

  return existing;
}

export function clearStoredReferral(): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  deleteCookie(REFERRAL_COOKIE_NAME);
}
