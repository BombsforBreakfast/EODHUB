import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Deletes calendar events whose date has passed. Memorials are in a separate
// table and are never touched here.
export async function POST(req: NextRequest) {
  // Require any logged-in user to prevent unauthenticated invocations
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
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use service role to bypass RLS and delete any expired event
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { error, count } = await adminClient
    .from("events")
    .delete({ count: "exact" })
    .lt("date", today);

  if (error) {
    console.error("cleanup-events error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
