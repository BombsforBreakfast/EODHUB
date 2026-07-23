import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST_AS_ADMIN_EMAIL } from "@/app/lib/postAsIdentity";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReminderKind = "event_t30" | "event_t7";

function ymdPlusDays(base: Date, days: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function captionFor(kind: ReminderKind, title: string | null): string {
  const name = title?.trim() || "this event";
  if (kind === "event_t30") return `Coming up in 30 days: ${name}`;
  return `Coming up in 7 days: ${name}`;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  const authorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && querySecret === cronSecret);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: adminProfile, error: adminProfileErr } = await supabase
    .from("profiles")
    .select("user_id")
    .ilike("email", POST_AS_ADMIN_EMAIL)
    .maybeSingle();
  if (adminProfileErr) {
    return NextResponse.json({ error: adminProfileErr.message }, { status: 500 });
  }
  const adminUserId = (adminProfile as { user_id?: string | null } | null)?.user_id;
  if (!adminUserId) {
    return NextResponse.json({ error: "EOD-HUB admin profile not found." }, { status: 500 });
  }

  const today = new Date();
  const t30Date = ymdPlusDays(today, 30);
  const t7Date = ymdPlusDays(today, 7);

  const windows: Array<{ kind: ReminderKind; eventDate: string }> = [
    { kind: "event_t30", eventDate: t30Date },
    { kind: "event_t7", eventDate: t7Date },
  ];

  let inserted = 0;
  let scanned = 0;
  const errors: string[] = [];

  for (const { kind, eventDate } of windows) {
    const { data: events, error: eventsErr } = await supabase
      .from("events")
      .select("id, title, date")
      .eq("visibility", "public")
      .eq("is_approved", true)
      .is("unit_id", null)
      .eq("date", eventDate);

    if (eventsErr) {
      errors.push(`${kind}: ${eventsErr.message}`);
      continue;
    }

    const eventRows = (events ?? []) as Array<{ id: string; title: string | null; date: string }>;
    scanned += eventRows.length;
    if (eventRows.length === 0) continue;

    const eventIds = eventRows.map((e) => e.id);
    const { data: existing, error: existingErr } = await supabase
      .from("posts")
      .select("event_id")
      .eq("content_type", kind)
      .in("event_id", eventIds);

    if (existingErr) {
      errors.push(`${kind} lookup: ${existingErr.message}`);
      continue;
    }

    const existingSet = new Set(
      ((existing ?? []) as Array<{ event_id: string | null }>)
        .map((r) => r.event_id)
        .filter((id): id is string => Boolean(id)),
    );

    const inserts = eventRows
      .filter((e) => !existingSet.has(e.id))
      .map((e) => ({
        user_id: adminUserId,
        event_id: e.id,
        content_type: kind,
        content: captionFor(kind, e.title),
        created_at: new Date().toISOString(),
      }));

    if (inserts.length === 0) continue;

    const { error: insertErr } = await supabase.from("posts").insert(inserts);
    if (insertErr) {
      errors.push(`${kind} insert: ${insertErr.message}`);
      continue;
    }
    inserted += inserts.length;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    scanned,
    targets: { t30: t30Date, t7: t7Date },
    errors: errors.length ? errors : undefined,
  });
}
