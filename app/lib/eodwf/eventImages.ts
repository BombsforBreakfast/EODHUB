/** Image helpers for EODWF event import covers. */

const WEAK_BASENAME_RE =
  /(?:bishop|athlete|logo|badge|bbb|shield|candid|favicon|sprite|icon|avatar|placeholder)/i;

const TINY_OR_BANNER_SIZE_RE = /-\d{2,4}x(?:\d{1,2}|[1-8]\d)(?=\.|$)/i; // e.g. -300x87, -150x40

export function absolutizeUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Prefer unsized original when WP serves -1024x1024 style derivatives. */
export function preferUnsizedUploadUrl(url: string): string {
  const m = url.match(
    /^(https?:\/\/.+\/)([^/?#]+)-(\d{2,5})x(\d{2,5})\.(webp|jpe?g|png|gif)(\?.*)?$/i,
  );
  if (!m) return url;
  return `${m[1]}${m[2]}.${m[5]}${m[6] ?? ""}`;
}

function basenameOfUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split("/").pop() || path;
  } catch {
    return url.split("?")[0]?.split("/").pop() || url;
  }
}

export function isWeakEventCoverUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const u = url.trim();
  const base = basenameOfUrl(u);
  if (WEAK_BASENAME_RE.test(base)) return true;
  if (TINY_OR_BANNER_SIZE_RE.test(base)) return true;
  if (/\/avatars?\//i.test(u)) return true;
  return false;
}

type SizedImage = {
  url?: string;
  width?: number;
  height?: number;
};

/**
 * Pick the largest Tribe featured image (full sizes.* then top-level url).
 */
export function pickLargestTribeImageUrl(image: {
  url?: string;
  width?: number;
  height?: number;
  sizes?: Record<string, SizedImage>;
} | null | undefined): string | null {
  if (!image || typeof image !== "object") return null;
  const candidates: Array<{ url: string; area: number }> = [];
  const push = (url: string | undefined, w?: number, h?: number) => {
    const trimmed = url?.trim();
    if (!trimmed) return;
    const area =
      typeof w === "number" && typeof h === "number" && w > 0 && h > 0
        ? w * h
        : 0;
    candidates.push({ url: trimmed, area });
  };

  push(image.url, image.width, image.height);
  for (const size of Object.values(image.sizes ?? {})) {
    push(size?.url, size?.width, size?.height);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.area - a.area || b.url.length - a.url.length);
  return preferUnsizedUploadUrl(candidates[0].url);
}

export function extractUploadImageUrlsFromHtml(html: string, base: string): string[] {
  const found: string[] = [];
  const imgRe = /(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    const abs = absolutizeUrl(m[1], base);
    if (!abs) continue;
    if (!/wp-content\/uploads/i.test(abs)) continue;
    if (!/\.(?:webp|jpe?g|png|gif)(?:$|\?)/i.test(abs)) continue;
    found.push(preferUnsizedUploadUrl(abs));
  }

  const metaPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/gi,
  ];
  for (const re of metaPatterns) {
    re.lastIndex = 0;
    while ((m = re.exec(html))) {
      const abs = absolutizeUrl(m[1], base);
      if (!abs) continue;
      if (!/\.(?:webp|jpe?g|png|gif)(?:$|\?)/i.test(abs)) continue;
      found.push(preferUnsizedUploadUrl(abs));
    }
  }

  return [...new Set(found)];
}

/** Prefer non-weak, larger-looking upload URLs. */
export function pickBestEventCoverUrl(candidates: string[]): string | null {
  const scored = candidates
    .map((url) => url.trim())
    .filter(Boolean)
    .filter((url) => !isWeakEventCoverUrl(url))
    .map((url) => {
      const dim = url.match(/-(\d{2,5})x(\d{2,5})\./i);
      const area = dim ? Number(dim[1]) * Number(dim[2]) : 1_000_000;
      const unsizedBonus = /-\d+x\d+\./i.test(url) ? 0 : 500_000;
      return { url: preferUnsizedUploadUrl(url), score: area + unsizedBonus };
    });
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  return scored[0].url;
}

/**
 * Fetch a page and return the best cover candidate (og / content uploads).
 * Skips captcha walls and non-HTML responses quietly.
 */
export async function fetchPageCoverCandidate(
  pageUrl: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://www.eod-hub.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(opts?.timeoutMs ?? 20000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct && !ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    const html = await res.text();
    if (/bot verification|recaptcha|captcha/i.test(html.slice(0, 4000))) return null;
    return pickBestEventCoverUrl(extractUploadImageUrlsFromHtml(html, pageUrl));
  } catch {
    return null;
  }
}

/**
 * Within one import batch, featured URLs reused across multiple events are
 * usually site defaults (e.g. Bishop.webp), not event-specific flyers.
 */
export function sharedImageUrls(urls: Array<string | null | undefined>, minShare = 2): Set<string> {
  const counts = new Map<string, number>();
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    const key = preferUnsizedUploadUrl(url).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const shared = new Set<string>();
  for (const [url, n] of counts) {
    if (n >= minShare) shared.add(url);
  }
  return shared;
}
