import type { CSSProperties, ReactNode } from "react";

/** Detects http(s) URLs in plain text (e.g. contribution summaries). */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;

/**
 * Strips trailing characters that often get pasted after URLs in running prose.
 */
function trimUrlHref(raw: string): string {
  let s = raw;
  while (s.length > 0) {
    const ch = s[s.length - 1]!;
    if (/[.,;:!?)\]}>]+$/.test(ch)) s = s.slice(0, -1);
    else break;
  }
  return s;
}

/**
 * Renders plain text with `http(s)://…` spans turned into external links.
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
    const href = trimUrlHref(raw);
    const tail = raw.slice(href.length);
    nodes.push(
      <a
        key={`lh-${k++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {href}
      </a>
    );
    if (tail) nodes.push(tail);
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length > 0 ? nodes : text;
}
