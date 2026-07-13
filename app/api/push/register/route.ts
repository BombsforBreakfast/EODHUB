import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RegisterBody = {
  token?: string;
  platform?: "ios" | "android";
};

/**
 * POST /api/push/register
 * Upserts a native device token for the authenticated user.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  const platform = body.platform ?? "ios";
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "invalid platform" }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await db
    .from("notification_preferences")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  // APNs tokens identify an app installation, not an account. If this device
  // switches accounts, prevent the prior account from receiving its pushes.
  const { error: ownershipError } = await db
    .from("push_device_tokens")
    .delete()
    .eq("token", token)
    .neq("user_id", user.id);
  if (ownershipError) {
    console.error("[push/register] token ownership cleanup failed", ownershipError);
    return NextResponse.json({ error: ownershipError.message }, { status: 500 });
  }

  const { error } = await db.from("push_device_tokens").upsert(
    {
      user_id: user.id,
      platform,
      token,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" },
  );

  if (error) {
    console.error("[push/register] upsert failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/push/register
 * Removes a device token on logout or when user disables push.
 */
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");
  if (!bearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${bearer}` } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterBody = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await db
    .from("push_device_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
