// Light-weight article body fetcher.
//
// Used by the runner to "second-pass" enrich candidates whose headline +
// RSS/GDELT snippet didn't trip any positive keyword. The classic case is an
// Army Times piece whose headline says "Officer pleads guilty in smuggling
// case" but whose body says "...Army's Explosive Ordnance Disposal at Fort
// Campbell". Without a body fetch the scorer can't see that signal at all.
//
// Design constraints:
//   - No new dependencies. Plain fetch + regex strip.
//   - Bounded runtime: per-fetch timeout, total cap, modest concurrency.
//   - Polite: identifies itself in User-Agent, follows redirects, accepts
//     that some sites paywall / 403 us — those just return null.
//   - Returns plain-ish text, capped to ~6KB, which is more than enough for
//     keyword matching without bloating downstream regex work.

const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_BODY_CHARS = 6_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; EOD-Hub-Newsbot/1.0; +https://www.eod-hub.com)";

function stripHtml(html: string): string {
  return html
    // Drop everything inside <script>, <style>, <noscript>, <svg>.
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    // Drop <head>…</head>.
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    // Replace block tags with spaces so words don't run together.
    .replace(/<\/?(p|div|br|li|h[1-6]|section|article|header|footer)[^>]*>/gi, " ")
    // Strip remaining tags.
    .replace(/<[^>]+>/g, " ")
    // Decode the most common entities (no need for a full table).
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchArticleBody(
  url: string,
  opts: { timeoutMs?: number } = {}
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        // Some CDNs gate non-browser UAs; advertising Accept helps.
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    const html = await res.text();
    if (!html) return null;
    const text = stripHtml(html);
    if (!text) return null;
    return text.slice(0, MAX_BODY_CHARS);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `fetchArticleBody` over an array with bounded concurrency. */
export async function fetchBodiesConcurrent<T>(
  items: T[],
  getUrl: (item: T) => string,
  onResult: (item: T, body: string | null) => void,
  concurrency = 5
): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      const item = items[i];
      const body = await fetchArticleBody(getUrl(item));
      onResult(item, body);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
