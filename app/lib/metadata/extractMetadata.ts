import { lookup } from "node:dns/promises";
import net from "node:net";

export type ExtractedMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
};

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIp(ip: string): boolean {
  const ipVersion = net.isIP(ip);
  if (ipVersion === 4) return isPrivateIpv4(ip);
  if (ipVersion === 6) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
    if (normalized.startsWith("fe80")) return true; // link-local
    return false;
  }
  return true;
}

async function assertSafePublicHttpUrl(websiteUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(websiteUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("URL protocol must be http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL credentials are not allowed");
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Local/internal hosts are not allowed");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Private network hosts are not allowed");
    return parsed;
  }

  const resolved = await lookup(host, { all: true, verbatim: true });
  if (!resolved.length) {
    throw new Error("Host could not be resolved");
  }
  for (const addr of resolved) {
    if (isPrivateIp(addr.address)) {
      throw new Error("Private network hosts are not allowed");
    }
  }
  return parsed;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractMetaTag(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function absolutizeUrl(assetUrl: string | null, pageUrl: string): string | null {
  if (!assetUrl) return null;

  try {
    return new URL(assetUrl, pageUrl).toString();
  } catch {
    return assetUrl;
  }
}

function normalizeImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;

  if (imageUrl.startsWith("http://")) {
    return imageUrl.replace("http://", "https://");
  }

  return imageUrl;
}

export async function extractMetadata(websiteUrl: string): Promise<ExtractedMetadata> {
  const parsedUrl = await assertSafePublicHttpUrl(websiteUrl);
  const safeUrl = parsedUrl.toString();

  const response = await fetch(safeUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EODZoneBot/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status}`);
  }

  const html = await response.text();

  const title =
    extractMetaTag(html, "og:title") ||
    extractMetaTag(html, "twitter:title") ||
    extractTitle(html);

  const description =
    extractMetaTag(html, "og:description") ||
    extractMetaTag(html, "twitter:description") ||
    extractMetaTag(html, "description");

  const rawImage =
    extractMetaTag(html, "og:image") ||
    extractMetaTag(html, "twitter:image");

  const image = normalizeImageUrl(absolutizeUrl(rawImage, safeUrl));

  const siteName =
    extractMetaTag(html, "og:site_name") ||
    extractMetaTag(html, "twitter:site");

  return {
    title,
    description,
    image,
    siteName,
    url: safeUrl,
  };
}