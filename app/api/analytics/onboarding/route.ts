import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isExcludedAnalyticsUser } from "@/app/lib/analyticsExclusions";
import {
  ONBOARDING_FUNNEL_STEPS,
  type OnboardingEventKind,
  type OnboardingFunnelStep,
} from "@/app/lib/onboardingAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STEPS = new Set<string>(ONBOARDING_FUNNEL_STEPS);
const VALID_EVENTS = new Set<string>(["view", "action", "success", "error"]);

export async function POST(req: NextRequest) {
  let body: { step?: unknown; event?: unknown; metadata?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const step = typeof body.step === "string" ? body.step : "";
  if (!VALID_STEPS.has(step)) {
    return NextResponse.json({ error: "Invalid step" }, { status: 400 });
  }

  const eventRaw = typeof body.event === "string" ? body.event : "view";
  const event: OnboardingEventKind = VALID_EVENTS.has(eventRaw)
    ? (eventRaw as OnboardingEventKind)
    : "view";

  const metadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

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
  const user = authData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isExcludedAnalyticsUser(user)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error } = await admin.from("onboarding_events").insert({
    user_id: user.id,
    step: step as OnboardingFunnelStep,
    event,
    metadata,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
