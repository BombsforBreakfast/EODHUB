"use client";
import type { AnalyticsSubject, EngagementKind } from "./analytics";

const seen = new Map<string, number>();
const windowMs = 30 * 60 * 1000;
// No visitor identifier or contact data is collected. Dedupe is local to this tab.
export function recordRentalEngagement(subject: AnalyticsSubject, id: string, kind: EngagementKind) {
  try {
    if (typeof window === "undefined") return;
    const key = `rental-engagement-v1:${subject}:${id}:${kind}`, now = Date.now();
    let previous = seen.get(key) ?? 0;
    try { previous = Math.max(previous, Number(sessionStorage.getItem(key)) || 0); } catch { /* private browsing */ }
    if (now - previous < windowMs) return;
    seen.set(key, now);
    try { sessionStorage.setItem(key, String(now)); } catch { /* memory fallback */ }
    void fetch("/api/rentals/events", { method: "POST", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, id, kind, eventId: crypto.randomUUID() }) }).catch(() => {});
  } catch { /* Analytics must never interrupt browsing or contact links. */ }
}
