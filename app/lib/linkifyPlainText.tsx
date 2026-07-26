import type { CSSProperties, ReactNode } from "react";

/** Detects http(s) URLs and common bare domains in plain text. */
const URL_RE =
  /https?:\/\/[^\s<>"']+|\b(?:www\.)?[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|gov|mil|edu|io|co|info|biz|us|uk|ca|au|de|fr|app|dev|tech)[^\s<>"']*/gi;

function trimUrlHref(raw: string): string {
  let s = raw;
  while (s.length > 0) {
    const ch = s[s.length - 1]!;
    if (/[.,;:!?)\]}>]+$/.test(ch)) s = s.slice(0, -1);
    else break;
  }
  return s;
}

function toHref(raw: string): string {
  const trimmed = trimUrlHref(raw);
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Renders plain text with URLs turned into external links.
 * Safe for user-authored text: no HTML parsing, only URL detection.
 */
export function linkifyPlainText(text: string, linkStyle?: CSSProperties): ReactNode {
  if (!text) return null;
  const nodes: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(URL_RE.source, URL_RE.flags);
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const href = toHref(raw);
    const display = trimUrlHref(raw);
    const tail = raw.slice(display.length);
    nodes.push(
      <a
        key={`lh-${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {display}
      </a>,
    );
    if (tail) nodes.push(tail);
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : text;
}
