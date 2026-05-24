/** Supabase Free tier quotas (org-level, per billing docs). */
export const SUPABASE_FREE_TIER = {
  plan: "free" as const,
  mau: 50_000,
  databaseBytes: 500 * 1024 * 1024,
  storageBytes: 1024 * 1024 * 1024,
  egressBytes: 5 * 1024 * 1024 * 1024,
  realtimePeakConnections: 200,
  realtimeMessagesPerMonth: 2_000_000,
} as const;

/** Review when usage crosses ~80% of Free limits (plan recommendation). */
export const SUPABASE_WATCH_THRESHOLDS = {
  mau: Math.floor(SUPABASE_FREE_TIER.mau * 0.8),
  databaseBytes: Math.floor(SUPABASE_FREE_TIER.databaseBytes * 0.8),
  storageBytes: Math.floor(SUPABASE_FREE_TIER.storageBytes * 0.8),
  egressBytes: Math.floor(SUPABASE_FREE_TIER.egressBytes * 0.8),
  realtimePeakConnections: Math.floor(
    SUPABASE_FREE_TIER.realtimePeakConnections * 0.8,
  ),
} as const;

export type UsageLevel = "ok" | "watch" | "critical";

export function usageLevel(
  current: number,
  limit: number,
  watchAt = limit * 0.8,
): UsageLevel {
  if (current >= limit) return "critical";
  if (current >= watchAt) return "watch";
  return "ok";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString();
}

export function pctOfLimit(current: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

/** Parse project ref from NEXT_PUBLIC_SUPABASE_URL (client-safe when inlined). */
export function supabaseProjectRefFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const ref = host.split(".")[0];
    return ref || null;
  } catch {
    return null;
  }
}

export function supabaseDashboardUrls(projectRef: string | null) {
  const base = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}`
    : "https://supabase.com/dashboard";
  return {
    usage: `${base}/settings/billing/usage`,
    subscription: `${base}/settings/billing/subscription`,
    storage: `${base}/storage/buckets`,
    logs: `${base}/logs/explorer`,
  };
}

export const SUPABASE_USAGE_REVIEW_STORAGE_KEY = "eod_supabase_usage_last_reviewed";

export const MONTHLY_REVIEW_CHECKLIST = [
  "Open Supabase → Settings → Billing → Usage",
  "Check file storage (watch at ~800 MB of 1 GB)",
  "Check egress / bandwidth (watch at ~4 GB of 5 GB)",
  "Check Realtime peak connections (watch at ~150 of 200)",
  "Check database size (watch at ~400 MB of 500 MB)",
  "Confirm MAU is comfortably under 50k (4–5k users is fine)",
  "Check GIPHY API calls in Infrastructure tab (watch at ~80 calls in the last hour)",
] as const;
