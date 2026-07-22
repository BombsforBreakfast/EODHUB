/** Shared mention helpers: stored as `@[Display Name](userId)`. */

const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Parse stored `@[Name](userId)` → unique user IDs. */
export function extractMentionIds(rawContent: string): string[] {
  const ids: string[] = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawContent)) !== null) ids.push(m[2]);
  return [...new Set(ids)];
}

/** Convert stored mention syntax to display text (`@Name`). */
export function mentionsToDisplayText(rawContent: string): string {
  return rawContent.replace(MENTION_TOKEN_RE, "@$1");
}

/**
 * Walk stored content and yield plain segments + mention tokens
 * for rendering (links, highlight, etc.).
 */
export function splitMentionTokens(
  rawContent: string,
): Array<{ type: "text"; value: string } | { type: "mention"; name: string; userId: string }> {
  const parts: Array<
    { type: "text"; value: string } | { type: "mention"; name: string; userId: string }
  > = [];
  const re = new RegExp(MENTION_TOKEN_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawContent)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: rawContent.slice(last, m.index) });
    }
    parts.push({ type: "mention", name: m[1], userId: m[2] });
    last = m.index + m[0].length;
  }
  if (last < rawContent.length) {
    parts.push({ type: "text", value: rawContent.slice(last) });
  }
  return parts;
}
