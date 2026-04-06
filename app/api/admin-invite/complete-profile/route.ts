import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SIGNUP_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Staff signup is not configured" },
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

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const inviteKey = typeof body?.inviteKey === "string" ? body.inviteKey : "";
  const firstName =
    typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body?.lastName === "string" ? body.lastName.trim() : "";

  if (inviteKey !== secret) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 403 });
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "First and last name are required" },
      { status: 400 }
    );
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await admin.from("profiles").upsert(
    {
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      account_type: "admin",
      is_admin: true,
      is_employer: false,
      employer_verified: false,
      verification_status: "verified",
      is_approved: true,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
