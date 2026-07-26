import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCollapsingCircuitEnabled } from "@/app/lib/circuit";
import {
  insertCircuitEventTiles,
  isCircuitEligibleEvent,
  resolveCircuitAdminUserId,
} from "@/app/lib/circuitEventTiles";
import { POST_AS_ADMIN_EMAIL } from "@/app/lib/postAsIdentity";
import { hasFullPlatformAccess, type VerificationProfile } from "@/app/lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Push a public global event into Collapsing Circuit (24h). Idempotent source_key. */
export async function POST(req: NextRequest) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, is_admin, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { event_id?: string } | null;
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  if (!eventId) return NextResponse.json({ error: "Missing event_id." }, { status: 400 });

  const { data: event, error: eventErr } = await admin
    .from("events")
    .select("id, title, user_id, visibility, is_approved, unit_id")
    .eq("id", eventId)
    .maybeSingle();

  if (eventErr) return NextResponse.json({ error: eventErr.message }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const isOwner = event.user_id === user.id;
  const isAdmin = Boolean(profile.is_admin);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isCircuitEligibleEvent(event)) {
    return NextResponse.json(
      { error: "Only approved public global events can enter the Circuit." },
      { status: 400 },
    );
  }

  const adminUserId = await resolveCircuitAdminUserId(admin, POST_AS_ADMIN_EMAIL);
  if (!adminUserId) {
    return NextResponse.json({ error: "EOD-HUB admin profile not found." }, { status: 500 });
  }

  const result = await insertCircuitEventTiles(admin, {
    adminUserId,
    kind: "event_publish",
    events: [{ id: event.id, title: event.title }],
    refreshExisting: true,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    refreshed: result.refreshed,
    skipped: result.skipped,
  });
}
