export type ExtractedMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  url: string;
};

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
  const response = await fetch(websiteUrl, {
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

  const image = normalizeImageUrl(absolutizeUrl(rawImage, websiteUrl));

  const siteName =
    extractMetaTag(html, "og:site_name") ||
    extractMetaTag(html, "twitter:site");

  return {
    title,
    description,
    image,
    siteName,
    url: websiteUrl,
  };
}