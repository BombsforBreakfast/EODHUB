// Direct RSS / Atom feed lane.
//
// We deliberately avoid adding a dependency for ~6 curated feeds. The parser
// below extracts <item> (RSS 2.0) and <entry> (Atom) blocks via regex, then
// pulls the fields we care about. Robust enough for the named sources; if a
// feed turns out to be malformed, swap in `rss-parser` behind the same
// NewsProvider interface — the rest of the pipeline is parser-agnostic.

import { DIRECT_FEEDS, type DirectFeedSource } from "../config/sources";
import { normalizeCandidate } from "../normalize";
import type { NewsCandidate } from "../types";
import type { NewsProvider } from "./types";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "EODHubNewsBot/1.0 (+https://www.eod-hub.com)";

async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: controller.signal,
      // RSS endpoints often gate caching; we run hourly so a fresh hit is fine.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function tagText(block: string, tag: string): string | null {
  // Tries `<tag>...</tag>`. Handles namespaces like `media:thumbnail` if tag
  // includes the prefix.
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return decodeEntities(stripTags(stripCdata(m[1]))).trim() || null;
}

function attrFromSelfClosing(block: string, tag: string, attr: string): string | null {
  // For `<media:thumbnail url="..."/>` and `<enclosure url="..." />` styles.
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["'][^>]*\\/?>`, "i");
  const m = block.match(re);
  return m ? m[1] : null;
}

function atomLinkHref(block: string): string | null {
  // Atom: <link href="..." rel="alternate" />.
  const re = /<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseFeed(xml: string): Array<Record<string, string | null>> {
  const items: Array<Record<string, string | null>> = [];

  // RSS 2.0 items.
  const rssMatches = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of rssMatches) {
    items.push({
      title: tagText(block, "title"),
      link: tagText(block, "link"),
      description: tagText(block, "description") ?? tagText(block, "content:encoded"),
      pubDate: tagText(block, "pubDate") ?? tagText(block, "dc:date"),
      thumbnail:
        attrFromSelfClosing(block, "media:thumbnail", "url") ??
        attrFromSelfClosing(block, "media:content", "url") ??
        attrFromSelfClosing(block, "enclosure", "url"),
    });
  }

  // Atom entries.
  const atomMatches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of atomMatches) {
    items.push({
      title: tagText(block, "title"),
      link: tagText(block, "link") ?? atomLinkHref(block),
      description: tagText(block, "summary") ?? tagText(block, "content"),
      pubDate: tagText(block, "updated") ?? tagText(block, "published"),
      thumbnail:
        attrFromSelfClosing(block, "media:thumbnail", "url") ??
        attrFromSelfClosing(block, "media:content", "url"),
    });
  }

  return items;
}

async function ingestOneFeed(source: DirectFeedSource): Promise<NewsCandidate[]> {
  const xml = await fetchWithTimeout(source.url);
  if (!xml) return [];
  const rows = parseFeed(xml);
  const out: NewsCandidate[] = [];
  for (const r of rows) {
    if (!r.title || !r.link) continue;
    const candidate = normalizeCandidate({
      headline: r.title,
      source_url: r.link,
      summary: r.description ?? null,
      published_at: r.pubDate ?? null,
      thumbnail_url: r.thumbnail ?? null,
      source_name: source.name,
      is_satire: source.isSatire ?? false,
      source_weight: source.weight,
      raw: { provider: "feeds", feed: source.name, ...r },
    });
    if (candidate) out.push(candidate);
  }
  return out;
}

export async function fetchCandidatesFromFeeds(): Promise<NewsCandidate[]> {
  const settled = await Promise.allSettled(DIRECT_FEEDS.map(ingestOneFeed));
  const out: NewsCandidate[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") out.push(...s.value);
  }
  return out;
}

export const feedsProvider: NewsProvider = {
  id: "feeds",
  fetchCandidates: fetchCandidatesFromFeeds,
};
