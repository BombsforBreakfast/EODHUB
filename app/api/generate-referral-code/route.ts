import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureReferralCode } from "@/app/lib/server/ensureReferralCode";

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

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const code = await ensureReferralCode(adminClient, user.id);
    if (!code) {
      return NextResponse.json({ error: "Referral codes are not issued for this account" }, { status: 400 });
    }
    return NextResponse.json({ code });
  } catch (err) {
    console.error("generate-referral-code failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate unique code" },
      { status: 500 },
    );
  }
}
