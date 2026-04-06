import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "../../../lib/appBaseUrl";

export async function GET(req: NextRequest) {
  const secret = process.env.ADMIN_SIGNUP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SIGNUP_SECRET is not set" },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const founderId = process.env.FOUNDER_USER_ID?.trim() || null;
  if (founderId && user.id !== founderId) {
    return NextResponse.json(
      {
        error: "Only the founder account can view the staff signup link.",
        code: "FOUNDER_ONLY",
      },
      { status: 403 }
    );
  }

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const base = getAppBaseUrl();
  const url = `${base}/admin-invite-signup?k=${encodeURIComponent(secret)}`;

  return NextResponse.json({ url });
}
