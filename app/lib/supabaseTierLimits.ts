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

/** Supabase Pro tier quotas ($25/mo, org-level included usage). */
export const SUPABASE_PRO_TIER = {
  plan: "pro" as const,
  mau: 100_000,
  databaseBytes: 8 * 1024 * 1024 * 1024,
  storageBytes: 100 * 1024 * 1024 * 1024,
  egressBytes: 250 * 1024 * 1024 * 1024,
  realtimePeakConnections: 500,
  realtimeMessagesPerMonth: 5_000_000,
} as const;

export type SupabasePlan = "free" | "pro";

export type SupabaseTierLimits = {
  plan: SupabasePlan;
  mau: number;
  databaseBytes: number;
  storageBytes: number;
  egressBytes: number;
  realtimePeakConnections: number;
  realtimeMessagesPerMonth: number;
};

export type SupabaseWatchThresholds = {
  mau: number;
  databaseBytes: number;
  storageBytes: number;
  egressBytes: number;
  realtimePeakConnections: number;
};

/** Defaults to Pro after org upgrade; set SUPABASE_PLAN=free for free-tier dev. */
export function supabasePlanFromEnv(): SupabasePlan {
  const raw = process.env.SUPABASE_PLAN?.trim().toLowerCase();
  if (raw === "free") return "free";
  return "pro";
}

export function getSupabaseTierLimits(plan: SupabasePlan): SupabaseTierLimits {
  return plan === "pro" ? { ...SUPABASE_PRO_TIER } : { ...SUPABASE_FREE_TIER };
}

/** Review when usage crosses ~80% of plan limits. */
export function getSupabaseWatchThresholds(plan: SupabasePlan): SupabaseWatchThresholds {
  const limits = getSupabaseTierLimits(plan);
  return {
    mau: Math.floor(limits.mau * 0.8),
    databaseBytes: Math.floor(limits.databaseBytes * 0.8),
    storageBytes: Math.floor(limits.storageBytes * 0.8),
    egressBytes: Math.floor(limits.egressBytes * 0.8),
    realtimePeakConnections: Math.floor(limits.realtimePeakConnections * 0.8),
  };
}

/** @deprecated Use getSupabaseWatchThresholds(supabasePlanFromEnv()) */
export const SUPABASE_WATCH_THRESHOLDS = getSupabaseWatchThresholds("free");

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

export function getMonthlyReviewChecklist(plan: SupabasePlan): readonly string[] {
  if (plan === "pro") {
    return [
      "Open Supabase → Settings → Billing → Usage",
      "Check file storage (watch at ~80 GB of 100 GB)",
      "Check egress / bandwidth (watch at ~200 GB of 250 GB)",
      "Check Realtime peak connections (watch at ~400 of 500)",
      "Check database size (watch at ~6.4 GB of 8 GB)",
      "Confirm MAU is comfortably under 100k",
      "Check GIPHY API calls in Infrastructure tab (watch at ~80 calls in the last hour)",
    ];
  }
  return [
    "Open Supabase → Settings → Billing → Usage",
    "Check file storage (watch at ~800 MB of 1 GB)",
    "Check egress / bandwidth (watch at ~4 GB of 5 GB)",
    "Check Realtime peak connections (watch at ~150 of 200)",
    "Check database size (watch at ~400 MB of 500 MB)",
    "Confirm MAU is comfortably under 50k (4–5k users is fine)",
    "Check GIPHY API calls in Infrastructure tab (watch at ~80 calls in the last hour)",
  ];
}

/** @deprecated Use getMonthlyReviewChecklist(supabasePlanFromEnv()) */
export const MONTHLY_REVIEW_CHECKLIST = getMonthlyReviewChecklist("free");

export function supabaseUpgradeRecommendation(plan: SupabasePlan): string | null {
  if (plan === "pro") {
    return null;
  }
  return "Upgrade to Pro ($25/mo) before public launch for daily backups, no inactivity pause, and 100 GB storage / 250 GB egress headroom.";
}

export function supabasePlanSummary(plan: SupabasePlan): string {
  if (plan === "pro") {
    return "Pro ($25/mo) — daily backups, no inactivity pause, 100 GB file storage, 250 GB egress, 8 GB database, 100k MAU included.";
  }
  return "Free tier — 1 GB storage, 5 GB egress, 500 MB database. Projects pause after 1 week of inactivity.";
}
