import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// This gate grants access to the promotion brochure only, never member access.
export const PROMOTE_ACCESS_COOKIE = "eod_promote_access";
export const PROMOTE_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 256;

function isConfiguredPassword(password: string | undefined): password is string {
  return Boolean(
    password && password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH,
  );
}

export function getPromoteAccessPassword(): string | undefined {
  const password = process.env.PROMOTE_ACCESS_PASSWORD;
  return isConfiguredPassword(password) ? password : undefined;
}

export function matchesPromotePassword(candidate: unknown, password: string | undefined): boolean {
  if (!isConfiguredPassword(password) || typeof candidate !== "string" || candidate.length > MAX_PASSWORD_LENGTH) {
    return false;
  }
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(password).digest(),
  );
}

function sign(payload: string, password: string): string {
  return createHmac("sha256", password).update(`eodhub:promote-access:${payload}`).digest("base64url");
}

export function createPromoteAccessToken(password: string, nowMs = Date.now()): string {
  if (!isConfiguredPassword(password)) throw new Error("Promotion access is not configured.");
  const expiresAt = Math.floor(nowMs / 1000) + PROMOTE_ACCESS_TTL_SECONDS;
  const payload = `v1.${expiresAt}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, password)}`;
}

export function hasPromoteAccess(
  token: string | undefined,
  password: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!isConfiguredPassword(password) || !token || token.length > 200) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expiry, nonce, signature] = parts;
  if (version !== "v1" || !/^\d{10}$/.test(expiry) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[\w-]{43}$/.test(signature)) {
    return false;
  }
  const expiresAt = Number(expiry);
  const now = Math.floor(nowMs / 1000);
  if (expiresAt <= now || expiresAt > now + PROMOTE_ACCESS_TTL_SECONDS) return false;
  const expected = sign(`${version}.${expiry}.${nonce}`, password);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
