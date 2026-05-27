import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { clearFailedAuthReportsOnSuccessfulLogin } from "@/app/lib/server/clearFailedAuthReportsOnLogin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated hook invoked after a successful client-side sign-in.
 * Deletes unresolved failed_auth_reports for the signed-in user's email so
 * the admin triage queue no longer shows self-resolved login issues.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { client: adminClient, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !adminClient) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  const { deletedCount } = await clearFailedAuthReportsOnSuccessfulLogin(
    adminClient,
    user.email,
  );

  return NextResponse.json({ ok: true, deletedCount });
}
