/** IP geo deny-list for high-risk / adversarial jurisdictions. Speed bump, not a vault. */

export const DENIED_GEO_COUNTRY_CODES = new Set([
  "CN", // China
  "IR", // Iran
  "RU", // Russia
  "KP", // North Korea
  "VE", // Venezuela
  "CU", // Cuba
  "BY", // Belarus
  "SY", // Syria
]);

export function normalizeGeoCountryCode(code: string | null | undefined): string | null {
  if (!code || typeof code !== "string") return null;
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized === "XX" || normalized === "T1") return null;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function isDeniedGeoCountry(code: string | null | undefined): boolean {
  const normalized = normalizeGeoCountryCode(code);
  if (!normalized) return false;
  return DENIED_GEO_COUNTRY_CODES.has(normalized);
}

/** Read country from Vercel / Cloudflare edge headers. Missing → null (fail open). */
export function getRequestCountryCode(headers: Headers): string | null {
  return (
    normalizeGeoCountryCode(headers.get("x-vercel-ip-country")) ??
    normalizeGeoCountryCode(headers.get("cf-ipcountry"))
  );
}
