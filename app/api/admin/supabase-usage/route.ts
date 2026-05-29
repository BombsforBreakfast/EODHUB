import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getMonthlyReviewChecklist,
  getSupabaseTierLimits,
  getSupabaseWatchThresholds,
  supabaseDashboardUrls,
  supabasePlanFromEnv,
  supabasePlanSummary,
  supabaseProjectRefFromUrl,
  supabaseUpgradeRecommendation,
} from "@/app/lib/supabaseTierLimits";
import {
  GIPHY_DEV_TIER,
  GIPHY_WATCH_THRESHOLDS,
  GIPHY_DASHBOARD_URL,
  giphyPlanFromEnv,
} from "@/app/lib/giphyTierLimits";
import { countGiphyCallsLastHour } from "@/app/lib/server/logGiphyApiCall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UsageSnapshot = {
  database_bytes: number;
  storage_bytes: number;
  registered_profiles: number;
  auth_mau_approx: number;
  captured_at: string;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const projectRef = supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const dashboard = supabaseDashboardUrls(projectRef);

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  let snapshot: UsageSnapshot | null = null;
  let snapshotError: string | null = null;

  const { data: rpcData, error: rpcError } = await adminClient.rpc(
    "admin_supabase_usage_snapshot",
  );

  if (rpcError) {
    snapshotError = rpcError.message;
  } else if (rpcData && typeof rpcData === "object") {
    const row = rpcData as Record<string, unknown>;
    snapshot = {
      database_bytes: Number(row.database_bytes ?? 0),
      storage_bytes: Number(row.storage_bytes ?? 0),
      registered_profiles: Number(row.registered_profiles ?? 0),
      auth_mau_approx: Number(row.auth_mau_approx ?? 0),
      captured_at: String(row.captured_at ?? new Date().toISOString()),
    };
  }

  const giphyPlan = giphyPlanFromEnv();
  let giphyCallsLastHour = 0;
  let giphyError: string | null = null;

  if (giphyPlan === "development") {
    const giphyStats = await countGiphyCallsLastHour(adminClient);
    giphyCallsLastHour = giphyStats.count;
    giphyError = giphyStats.error;
  }

  const plan = supabasePlanFromEnv();
  const limits = getSupabaseTierLimits(plan);
  const watchThresholds = getSupabaseWatchThresholds(plan);

  return NextResponse.json({
    plan,
    projectRef,
    dashboard,
    limits,
    watchThresholds,
    monthlyReviewChecklist: getMonthlyReviewChecklist(plan),
    planSummary: supabasePlanSummary(plan),
    snapshot,
    snapshotError,
    notes: {
      egress:
        "Egress is org-level in Supabase and not queryable from Postgres. Check the billing usage dashboard.",
      realtime:
        "Realtime peak connections and message counts are only visible in Supabase billing usage.",
      mau:
        "auth_mau_approx counts auth.users active in the last 30 days; Supabase billing MAU may differ slightly.",
    },
    upgradeRecommendation: supabaseUpgradeRecommendation(plan),
    giphy: {
      plan: giphyPlan,
      dashboardUrl: GIPHY_DASHBOARD_URL,
      limits: GIPHY_DEV_TIER,
      watchThresholds: GIPHY_WATCH_THRESHOLDS,
      callsLastHour: giphyCallsLastHour,
      error: giphyError,
      upgradeRecommendation:
        "Upgrade your GIPHY API key to Production in the GIPHY developer dashboard when rolling hourly usage approaches 80 calls/hour (dev tier cap is 100/hr).",
    },
  });
}
