import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  anonymizeProfileForDeletion,
  logAccountDeletionRequest,
  normalizeDeletionReason,
  purgePersonalAccountData,
} from "@/app/lib/server/accountDeletion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    let body: { reason?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: authData } = await userClient.auth.getUser();
    const user = authData?.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("is_pure_admin, account_deleted_at, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.is_pure_admin) {
      return NextResponse.json(
        { error: "Staff accounts cannot be self-deleted. Contact support." },
        { status: 403 },
      );
    }

    if (profile.account_deleted_at) {
      return NextResponse.json({ error: "Account is already closed." }, { status: 409 });
    }

    const reason = normalizeDeletionReason(body.reason);
    const emailSnapshot = profile.email ?? user.email ?? null;

    const logResult = await logAccountDeletionRequest(adminClient, {
      userId: user.id,
      email: emailSnapshot,
      reason,
    });
    if (logResult.error) {
      return NextResponse.json({ error: logResult.error }, { status: 500 });
    }

    const purgeResult = await purgePersonalAccountData(adminClient, user.id);
    if (purgeResult.error) {
      return NextResponse.json({ error: purgeResult.error }, { status: 500 });
    }

    const anonymizeResult = await anonymizeProfileForDeletion(adminClient, user.id);
    if (anonymizeResult.error) {
      return NextResponse.json({ error: anonymizeResult.error }, { status: 500 });
    }

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unexpected error: " + msg }, { status: 500 });
  }
}
