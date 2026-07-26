import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/app/lib/notificationsServer";
import {
  PROFILE_COUNTRY_NEEDED_MESSAGE,
  PROFILE_COUNTRY_NEEDED_TITLE,
  PROFILE_COUNTRY_NEEDED_TYPE,
  profileCountryChallengeHref,
  viewerNeedsCountryPrompt,
} from "@/app/lib/membershipCountryPrompt";

/**
 * POST /api/account/ensure-country-prompt
 * Creates a one-time in-app notification (deduped) when the caller has no country set.
 */
export async function POST(req: NextRequest) {
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

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("user_id, country, account_type, is_pure_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[ensure-country-prompt] profile load failed", profileError);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }

  if (!viewerNeedsCountryPrompt(profile)) {
    return NextResponse.json({ created: false, reason: "not_needed" });
  }

  try {
    await createNotification(adminClient, {
      recipientUserId: user.id,
      type: PROFILE_COUNTRY_NEEDED_TYPE,
      category: "system",
      title: PROFILE_COUNTRY_NEEDED_TITLE,
      message: PROFILE_COUNTRY_NEEDED_MESSAGE,
      body: PROFILE_COUNTRY_NEEDED_MESSAGE,
      link: profileCountryChallengeHref(user.id),
      dedupeKey: `${PROFILE_COUNTRY_NEEDED_TYPE}:${user.id}`,
      metadata: { source: "ensure_country_prompt" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create notification";
    console.error("[ensure-country-prompt]", message, { userId: user.id });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ created: true });
}
