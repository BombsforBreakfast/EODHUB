import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Unambiguous characters (no O/0, I/1/l)
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function makeCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Return existing code if already has one
  const { data: profile } = await adminClient
    .from("profiles")
    .select("referral_code")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.referral_code) {
    return NextResponse.json({ code: profile.referral_code });
  }

  // Generate a unique code (retry on collision)
  let code = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = makeCode();
    const { data: existing } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("referral_code", candidate)
      .maybeSingle();
    if (!existing) { code = candidate; break; }
  }

  if (!code) return NextResponse.json({ error: "Could not generate unique code" }, { status: 500 });

  await adminClient
    .from("profiles")
    .update({ referral_code: code })
    .eq("user_id", user.id);

  return NextResponse.json({ code });
}
