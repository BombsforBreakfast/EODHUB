import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadAnalyticsExcludedUserIds } from "@/app/lib/analyticsExclusions";
import {
  ONBOARDING_FUNNEL_STEPS,
  ONBOARDING_STEP_LABELS,
  type OnboardingFunnelStep,
} from "@/app/lib/onboardingAnalytics";
import {
  emptyOnboardingFunnelResponse,
  isOnboardingEventsTableMissing,
} from "@/app/lib/onboardingFunnelEmpty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "90d";

function rangeStart(range: Range): Date {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: NextRequest) {
  try {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: Range =
    rangeParam === "7d" || rangeParam === "90d" ? rangeParam : "30d";
  const since = rangeStart(range);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      emptyOnboardingFunnelResponse(
        range,
        "Server misconfiguration: missing service role key.",
      ),
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const excluded = await loadAnalyticsExcludedUserIds(admin);

  const { data: events, error } = await admin
    .from("onboarding_events")
    .select("user_id, step, created_at")
    .gte("created_at", since.toISOString())
    .not("user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(100000);

  if (error) {
    if (isOnboardingEventsTableMissing(error)) {
      return NextResponse.json(
        emptyOnboardingFunnelResponse(
          range,
          "Run the onboarding_events migration (supabase db push) to enable signup funnel tracking.",
        ),
      );
    }
    console.error("onboarding-funnel events query:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usersByStep = new Map<OnboardingFunnelStep, Set<string>>();
  for (const step of ONBOARDING_FUNNEL_STEPS) {
    usersByStep.set(step, new Set());
  }

  const lastStepByUser = new Map<string, OnboardingFunnelStep>();
  const stepOrder = new Map(ONBOARDING_FUNNEL_STEPS.map((s, i) => [s, i]));

  for (const row of events ?? []) {
    const userId = row.user_id as string | null;
    const step = row.step as string;
    if (!userId || excluded.has(userId)) continue;
    if (!usersByStep.has(step as OnboardingFunnelStep)) continue;

    usersByStep.get(step as OnboardingFunnelStep)!.add(userId);

    const prev = lastStepByUser.get(userId);
    const prevIdx = prev != null ? stepOrder.get(prev) ?? -1 : -1;
    const nextIdx = stepOrder.get(step as OnboardingFunnelStep) ?? -1;
    if (nextIdx >= prevIdx) {
      lastStepByUser.set(userId, step as OnboardingFunnelStep);
    }
  }

  const signupCount = usersByStep.get("signup_complete")?.size ?? 0;

  const funnel = ONBOARDING_FUNNEL_STEPS.map((step, index) => {
    const users = usersByStep.get(step)?.size ?? 0;
    const prevStep = index > 0 ? ONBOARDING_FUNNEL_STEPS[index - 1] : null;
    const prevUsers = prevStep ? usersByStep.get(prevStep)?.size ?? 0 : signupCount;
    const conversionFromPrevious =
      prevUsers > 0 ? Math.round((users / prevUsers) * 1000) / 10 : null;
    const conversionFromStart =
      signupCount > 0 ? Math.round((users / signupCount) * 1000) / 10 : null;

    return {
      step,
      label: ONBOARDING_STEP_LABELS[step],
      users,
      conversion_from_previous_pct: conversionFromPrevious,
      conversion_from_start_pct: conversionFromStart,
    };
  });

  const verifiedIds = usersByStep.get("admin_verified") ?? new Set<string>();
  for (const userId of [...lastStepByUser.keys()]) {
    if (verifiedIds.has(userId)) {
      lastStepByUser.delete(userId);
    }
  }

  const dropOffCounts = new Map<string, number>();
  for (const step of lastStepByUser.values()) {
    dropOffCounts.set(step, (dropOffCounts.get(step) ?? 0) + 1);
  }

  const drop_offs = [...dropOffCounts.entries()]
    .map(([step, users]) => ({
      step,
      label: ONBOARDING_STEP_LABELS[step as OnboardingFunnelStep] ?? step,
      users,
    }))
    .sort((a, b) => b.users - a.users);

  // Cohort stuck on onboarding (no funnel events yet) from profiles
  const { count: incompleteProfiles } = await admin
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .gte("created_at", since.toISOString())
    .neq("verification_status", "verified")
    .is("service", null)
    .is("company_name", null);

  return NextResponse.json({
    range,
    generated_at: new Date().toISOString(),
    cohort_signups: signupCount,
    incomplete_profiles_no_events: incompleteProfiles ?? 0,
    funnel,
    drop_offs,
    note:
      signupCount === 0
        ? "No onboarding events recorded yet — data appears after the migration is applied and new signups flow through instrumented pages."
        : null,
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("onboarding-funnel:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
