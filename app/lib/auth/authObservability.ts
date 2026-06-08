type AuthCallKind = "getSession" | "getUser" | "refreshSession" | "signIn" | "signOut";

const WINDOW_MS = 5_000;
const WARN_THRESHOLD = 3;

const recentCalls: { kind: AuthCallKind; at: number; source: string }[] = [];

function prune(now: number) {
  while (recentCalls.length > 0 && now - recentCalls[0].at > WINDOW_MS) {
    recentCalls.shift();
  }
}

/** Development-only counter for duplicate Supabase auth API usage. */
export function trackAuthCall(kind: AuthCallKind, source: string) {
  if (process.env.NODE_ENV === "production") return;

  const now = Date.now();
  prune(now);
  recentCalls.push({ kind, at: now, source });

  const sameKind = recentCalls.filter((c) => c.kind === kind);
  if (sameKind.length >= WARN_THRESHOLD) {
    const sources = [...new Set(sameKind.map((c) => c.source))];
    console.warn(
      `[auth] ${kind} called ${sameKind.length} times within ${WINDOW_MS}ms`,
      { sources },
    );
  }
}
