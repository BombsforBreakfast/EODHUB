import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import { approveUserAccount } from "@/app/lib/server/approveUserAccount";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server misconfiguration: missing service role key" }, { status: 500 });
    }

    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: authData } = await userClient.auth.getUser();
    const caller = authData?.user;
    if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminProfile } = await userClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

    devAuthLog("admin-verify-user", { step: "request", adminId: caller.id, userId });

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const result = await approveUserAccount(
      adminClient,
      userId,
      req.nextUrl.origin,
      "admin",
    );

    return NextResponse.json({
      success: true,
      emailSent: result.emailSent,
      wasAlreadyApproved: result.wasAlreadyApproved,
      emailSkippedReason: result.emailSkippedReason,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("verify-user:", msg);
    return NextResponse.json({ error: "Unexpected error: " + msg }, { status: 500 });
  }
}
