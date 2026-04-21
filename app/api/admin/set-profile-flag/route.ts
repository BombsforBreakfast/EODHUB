import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_FLAGS = ["is_employer", "employer_verified", "is_admin"] as const;
type AllowedFlag = (typeof ALLOWED_FLAGS)[number];

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

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { targetUserId, flag, value, extraFields } = await req.json();
  if (!targetUserId || !flag || typeof value !== "boolean") {
    return NextResponse.json({ error: "Missing targetUserId, flag, or value" }, { status: 400 });
  }
  if (!ALLOWED_FLAGS.includes(flag as AllowedFlag)) {
    return NextResponse.json({ error: "Invalid flag" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updateData: Record<string, unknown> = { [flag]: value };
  if (extraFields && typeof extraFields === "object") {
    // Only allow safe extra fields
    if (typeof extraFields.company_website === "string") {
      updateData.company_website = extraFields.company_website || null;
    }
  }

  const { error } = await adminClient
    .from("profiles")
    .update(updateData)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
