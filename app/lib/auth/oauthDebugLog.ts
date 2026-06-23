/** Production-safe OAuth diagnostics — never log full codes or tokens. */

function truncate(value: string | null | undefined, max = 12): string | null {
  if (!value) return null;
  if (value.length <= max) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 4)}…(${value.length})`;
}

export function oauthDebugLog(
  stage: string,
  details?: Record<string, string | number | boolean | null | undefined>,
) {
  const safe: Record<string, string | number | boolean | null> = {};
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      if (value === undefined) continue;
      if (key === "code" || key === "access_token" || key === "refresh_token") {
        safe[key] = truncate(typeof value === "string" ? value : null);
      } else {
        safe[key] = value as string | number | boolean | null;
      }
    }
  }
  console.info(`[oauth] ${stage}`, safe);
}
