import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears the must_change_password flag for the caller's own profile.
 *
 * The Postgres trigger guard_provisioned_profile_flags blocks non-service_role
 * clients from changing this column directly. The ChangePasswordSection
 * component invokes this route after a successful supabase.auth.updateUser
 * (which itself requires the existing password), so by the time we get here
 * we trust the caller actually rotated the password.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.user.id;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ must_change_password: false })
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to clear temp password flag", detail: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
