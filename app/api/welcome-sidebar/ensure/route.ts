import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureWelcomeSidebarMessage } from "@/app/lib/server/ensureWelcomeSidebarMessage";

/**
 * POST /api/welcome-sidebar/ensure
 * Ensures the one-time founder welcome Sidebar DM for the authenticated user.
 */
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

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await ensureWelcomeSidebarMessage(adminClient, user.id);

  if (result.reason === "error") {
    console.error("[welcome-sidebar/ensure]", result.error, { userId: user.id });
    return NextResponse.json(
      { sent: false, reason: result.reason, error: result.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sent: result.sent,
    reason: result.reason,
    conversation_id: result.conversationId ?? null,
  });
}
