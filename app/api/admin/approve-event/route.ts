import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCollapsingCircuitEnabled } from "@/app/lib/circuit";
import {
  insertCircuitEventTiles,
  isCircuitEligibleEvent,
  resolveCircuitAdminUserId,
} from "@/app/lib/circuitEventTiles";
import { POST_AS_ADMIN_EMAIL } from "@/app/lib/postAsIdentity";

function adminClients(token: string) {
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return { userClient, adminClient };
}

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const { userClient, adminClient } = adminClients(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { adminClient, userId: user.id };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ("error" in auth && auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await auth.adminClient!
    .from("events")
    .update({ is_approved: true })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Immediate Circuit tile (local/dev gated). Memorials / unit events never enter.
  if (isCollapsingCircuitEnabled()) {
    const { data: event } = await auth.adminClient!
      .from("events")
      .select("id, title, visibility, is_approved, unit_id")
      .eq("id", id)
      .maybeSingle();
    if (event && isCircuitEligibleEvent(event)) {
      const adminUserId = await resolveCircuitAdminUserId(auth.adminClient!, POST_AS_ADMIN_EMAIL);
      if (adminUserId) {
        await insertCircuitEventTiles(auth.adminClient!, {
          adminUserId,
          kind: "event_publish",
          events: [{ id: event.id, title: event.title }],
          refreshExisting: true,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
