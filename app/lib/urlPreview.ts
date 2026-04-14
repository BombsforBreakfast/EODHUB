export type UrlPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

const BARE_DOMAIN_RE =
  /\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/;

export function extractFirstUrl(text: string): string | null {
  const explicit = text.match(/https?:\/\/[^\s]+/);
  if (explicit) return explicit[0].replace(/[.,)>]+$/, "");
  const bare = text.match(BARE_DOMAIN_RE);
  if (bare) return `https://${bare[0].replace(/[.,)>]+$/, "")}`;
  return null;
}

export function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice(7)}`;
  return trimmed;
}
