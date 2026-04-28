const ADZUNA_PATH_ID =
  /adzuna\.com\/(?:land\/ad|details)\/(\d+)/i;

/** Adzuna listing id as used in /details/{id} and /land/ad/{id}. */
export function parseAdzunaAdIdFromUrl(applyUrl: string): string | null {
  const m = applyUrl.match(ADZUNA_PATH_ID);
  return m?.[1] ?? null;
}

/** Stable apply link; avoids per-request tracking params on /land/ad/... URLs. */
export function canonicalAdzunaDetailsUrl(adId: string): string {
  return `https://www.adzuna.com/details/${adId}`;
}
