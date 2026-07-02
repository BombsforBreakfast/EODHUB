import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  handleRevenueCatWebhook,
  type RevenueCatWebhookBody,
} from "../../../lib/server/billing/revenueCatWebhook";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/revenuecat
 * RevenueCat server notification webhook — writes billing_* tables.
 * Configure in RevenueCat dashboard with Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");

  let body: RevenueCatWebhookBody;
  try {
    body = (await req.json()) as RevenueCatWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await handleRevenueCatWebhook(db, body, authHeader);
  return NextResponse.json(result.body, { status: result.status });
}
