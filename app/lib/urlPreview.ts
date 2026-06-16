export type UrlPreview = {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export const BARE_DOMAIN_RE =
  /\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/;

export const URL_PATTERN_G =
  /https?:\/\/[^\s]+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s,.)>]*/g;

/** True when a bare-domain match at `matchIndex` is the domain part of an email address. */
export function isEmailDomainMatch(text: string, matchIndex: number): boolean {
  const before = text.slice(0, matchIndex);
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return false;
  return !/\s/.test(before.slice(atIndex + 1));
}

function trimTrailingUrlPunctuation(value: string): string {
  return value.replace(/[.,)>]+$/, "");
}

export function extractFirstUrl(text: string): string | null {
  const explicit = text.match(/https?:\/\/[^\s]+/);
  if (explicit) return trimTrailingUrlPunctuation(explicit[0]);

  const re = new RegExp(BARE_DOMAIN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (isEmailDomainMatch(text, match.index)) continue;
    return `https://${trimTrailingUrlPunctuation(match[0])}`;
  }
  return null;
}

export function httpsAssetUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("http://")) return `https://${trimmed.slice(7)}`;
  return trimmed;
}
