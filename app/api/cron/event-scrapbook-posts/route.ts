import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dayAfterIso = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: events, error: eventsErr } = await supabase
    .from("events")
    .select("id, user_id, title, date, location")
    .eq("visibility", "public")
    .is("unit_id", null)
    .lte("date", dayAfterIso);
  if (eventsErr) {
    return NextResponse.json({ error: eventsErr.message }, { status: 500 });
  }

  const eventRows = (events ?? []) as Array<{
    id: string;
    user_id: string;
    title: string | null;
    date: string;
    location: string | null;
  }>;
  if (eventRows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, scanned: 0 });
  }

  const eventIds = eventRows.map((e) => e.id);
  const { data: existing, error: existingErr } = await supabase
    .from("posts")
    .select("event_id")
    .eq("content_type", "event_scrapbook")
    .in("event_id", eventIds);
  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  const existingSet = new Set(
    ((existing ?? []) as Array<{ event_id: string | null }>)
      .map((r) => r.event_id)
      .filter((id): id is string => Boolean(id))
  );

  const inserts = eventRows
    .filter((e) => !existingSet.has(e.id))
    .map((e) => ({
      user_id: e.user_id,
      event_id: e.id,
      content_type: "event_scrapbook",
      content: `Share memories from ${e.title ?? "this event"}`,
      created_at: new Date().toISOString(),
    }));

  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("posts").insert(inserts);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, inserted: inserts.length, scanned: eventRows.length });
}
