import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Mode = "member" | "employer";

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const targetUserId = body?.targetUserId as string | undefined;
  const mode = body?.mode as Mode | undefined;
  const companyWebsiteRaw = body?.company_website;

  if (!targetUserId || (mode !== "member" && mode !== "employer")) {
    return NextResponse.json({ error: "Missing targetUserId or invalid mode" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: targetRow } = await adminClient
    .from("profiles")
    .select("account_type")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (targetRow?.account_type === "admin") {
    return NextResponse.json(
      { error: "Staff admin accounts cannot be switched with this control." },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> =
    mode === "member"
      ? {
          account_type: "member",
          is_employer: false,
          employer_verified: false,
        }
      : {
          account_type: "employer",
          is_employer: true,
          employer_verified: true,
        };

  if (
    mode === "employer" &&
    typeof companyWebsiteRaw === "string" &&
    companyWebsiteRaw.trim() &&
    companyWebsiteRaw.trim() !== "https://"
  ) {
    patch.company_website = companyWebsiteRaw.trim();
  }

  const { data: updated, error } = await adminClient
    .from("profiles")
    .update(patch)
    .eq("user_id", targetUserId)
    .select("user_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
