import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "../../../lib/auth/adminAuthLookup";

/**
 * Switches the browser session to another auth.users row that shares the same
 * email as the currently signed-in user (legacy duplicate accounts).
 * Uses admin generateLink + client verifyOtp(magiclink) — no email is sent when
 * only the hash is consumed in-app.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  let body: { targetUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const targetUserId = body.targetUserId;
  if (!targetUserId || typeof targetUserId !== "string") {
    return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user: current } } = await userClient.auth.getUser();
  if (!current?.email) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  if (current.id === targetUserId) {
    return NextResponse.json({ error: "Already on this account" }, { status: 400 });
  }

  const { client: admin, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr === "missing_env") {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const { data: targetData, error: targetErr } = await admin!.auth.admin.getUserById(targetUserId);
  if (targetErr || !targetData.user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const target = targetData.user;
  if (target.email?.toLowerCase() !== current.email.toLowerCase()) {
    return NextResponse.json({ error: "Accounts are not linked by email" }, { status: 403 });
  }

  const { data: linkData, error: linkErr } = await admin!.auth.admin.generateLink({
    type: "magiclink",
    email: current.email,
  });

  if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not prepare account switch" },
      { status: 503 }
    );
  }

  if (linkData.user.id !== targetUserId) {
    return NextResponse.json(
      {
        error:
          "This email is attached to more than one login record and Supabase selected a different one. Sign in manually with that account, then use My Account → Sign-In Methods to link Google and email.",
        code: "ambiguous_magiclink",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink" as const,
  });
}
