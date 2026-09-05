/**
 * Hosts that load in an iframe but serve bot challenges or a broken preview.
 * Header checks (X-Frame-Options / CSP) miss these — the iframe onLoad still fires.
 */
const NEVER_EMBED_HOSTS = [
  "adzuna.com",
  "linkedin.com",
  "lnkd.in",
  "usajobs.gov",
  "indeed.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "reliefweb.int",
] as const;

export function hostBlocksInAppPreview(url: string): boolean {
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return NEVER_EMBED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}
