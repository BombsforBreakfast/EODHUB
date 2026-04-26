import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureSavedEventForUser } from "../../../lib/ensureSavedEventForUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { action: "toggle_attendance"; eventId: string; status: "interested" | "going" }
  | { action: "toggle_save"; eventId: string };

function userClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const client = userClient(token);
  const { data: authData, error } = await client.auth.getUser();
  if (error || !authData?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { userId: authData.user.id };
}

function normalizeDbError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("event_attendance") && m.includes("could not find")) {
    return "Event RSVP table is missing. Run migration 20260420070000_event_attendance_table.sql and retry.";
  }
  return message;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.eventId || (body.action !== "toggle_attendance" && body.action !== "toggle_save")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventId = body.eventId.trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId is required" }, { status: 400 });
  }

  const db = adminClient();

  // Ensure event exists so the client gets a clean message instead of generic FK errors.
  const { data: eventRow, error: eventErr } = await db
    .from("events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (eventErr) return NextResponse.json({ error: normalizeDbError(eventErr.message) }, { status: 500 });
  if (!eventRow?.id) {
    return NextResponse.json({ error: "This event no longer exists." }, { status: 404 });
  }

  if (body.action === "toggle_attendance") {
    const targetStatus = body.status;
    if (targetStatus !== "interested" && targetStatus !== "going") {
      return NextResponse.json({ error: "Invalid attendance status" }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await db
      .from("event_attendance")
      .select("id, status")
      .eq("event_id", eventId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: normalizeDbError(existingErr.message) }, { status: 500 });

    if (existing?.id && existing.status === targetStatus) {
      const { error } = await db
        .from("event_attendance")
        .delete()
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: normalizeDbError(error.message) }, { status: 500 });
    } else if (existing?.id) {
      const { error } = await db
        .from("event_attendance")
        .update({ status: targetStatus })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: normalizeDbError(error.message) }, { status: 500 });
      if (targetStatus === "going") {
        try {
          await ensureSavedEventForUser(db, auth.userId, eventId);
        } catch (e) {
          return NextResponse.json({ error: normalizeDbError(getErrorMessage(e)) }, { status: 500 });
        }
      }
    } else {
      const { error } = await db
        .from("event_attendance")
        .insert([{ event_id: eventId, user_id: auth.userId, status: targetStatus }]);
      if (error) return NextResponse.json({ error: normalizeDbError(error.message) }, { status: 500 });
      if (targetStatus === "going") {
        try {
          await ensureSavedEventForUser(db, auth.userId, eventId);
        } catch (e) {
          return NextResponse.json({ error: normalizeDbError(getErrorMessage(e)) }, { status: 500 });
        }
      }
    }
  } else {
    const { data: existingSave, error: existingSaveErr } = await db
      .from("saved_events")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (existingSaveErr) return NextResponse.json({ error: normalizeDbError(existingSaveErr.message) }, { status: 500 });

    if (existingSave?.id) {
      const { error } = await db.from("saved_events").delete().eq("id", existingSave.id);
      if (error) return NextResponse.json({ error: normalizeDbError(error.message) }, { status: 500 });
    } else {
      try {
        await ensureSavedEventForUser(db, auth.userId, eventId);
      } catch (e) {
        return NextResponse.json({ error: normalizeDbError(getErrorMessage(e)) }, { status: 500 });
      }
    }
  }

  const [{ data: attendanceRows, error: countsErr }, { data: myAttendanceRow, error: myErr }, { data: saveRow, error: saveErr }] = await Promise.all([
    db.from("event_attendance").select("status").eq("event_id", eventId),
    db
      .from("event_attendance")
      .select("status")
      .eq("event_id", eventId)
      .eq("user_id", auth.userId)
      .maybeSingle(),
    db
      .from("saved_events")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", auth.userId)
      .maybeSingle(),
  ]);

  if (countsErr || myErr || saveErr) {
    return NextResponse.json(
      {
        error: normalizeDbError(
          countsErr?.message || myErr?.message || saveErr?.message || "Could not refresh event state."
        ),
      },
      { status: 500 }
    );
  }

  const resolvedMyAttendance = ((myAttendanceRow as { status?: "interested" | "going" } | null)?.status ?? null);
  let resolvedSaved = Boolean(saveRow?.id);

  // Hard guarantee: "Going" always implies "Saved".
  if (resolvedMyAttendance === "going" && !resolvedSaved) {
    try {
      await ensureSavedEventForUser(db, auth.userId, eventId);
      resolvedSaved = true;
    } catch (e) {
      return NextResponse.json(
        { error: normalizeDbError(getErrorMessage(e)) },
        { status: 500 }
      );
    }
  }

  let interested = 0;
  let going = 0;
  ((attendanceRows ?? []) as Array<{ status: "interested" | "going" }>).forEach((row) => {
    if (row.status === "interested") interested += 1;
    if (row.status === "going") going += 1;
  });

  return NextResponse.json({
    ok: true,
    eventId,
    interested,
    going,
    myAttendance: resolvedMyAttendance,
    saved: resolvedSaved,
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Action failed.";
}

