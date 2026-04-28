import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENT_SELECT = "id, user_id, title, description, date, organization, signup_url, image_url, location, event_time, poc_name, poc_phone, created_at, unit_id, visibility";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const haystack = `${String(maybe.message ?? "")} ${String(maybe.details ?? "")} ${String(maybe.hint ?? "")}`.toLowerCase();
  return haystack.includes(columnName.toLowerCase()) && (haystack.includes("column") || maybe.code === "42703");
}

async function requireApprovedMember(req: NextRequest, slug: string) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const adminClient = getAdminClient();
  const { data: unit, error: unitError } = await adminClient
    .from("units")
    .select("id, name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (unitError || !unit) return { error: NextResponse.json({ error: "Unit not found" }, { status: 404 }) };

  const { data: membership } = await adminClient
    .from("unit_members")
    .select("role, status")
    .eq("unit_id", unit.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "approved") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { adminClient, unit, userId: user.id };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await requireApprovedMember(req, slug);
  if ("error" in auth) return auth.error;

  const { adminClient, unit, userId } = auth;
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");

  let query = adminClient
    .from("events")
    .select(EVENT_SELECT)
    .eq("unit_id", unit.id)
    .order("date", { ascending: true });
  if (start) query = query.gte("date", start);
  if (end) query = query.lte("date", end);

  const { data: events, error } = await query;
  if (error && isMissingColumnError(error, "unit_id")) {
    return NextResponse.json({ events: [], attendance: {}, myAttendance: {}, savedEventIds: [] });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventRows = (events ?? []) as Array<{ id: string }>;
  const eventIds = eventRows.map((event) => event.id);
  if (eventIds.length === 0) {
    return NextResponse.json({ events: [], attendance: {}, myAttendance: {}, savedEventIds: [] });
  }

  const [{ data: attendanceRows }, { data: savedRows }] = await Promise.all([
    adminClient
      .from("event_attendance")
      .select("event_id, user_id, status")
      .in("event_id", eventIds),
    adminClient
      .from("saved_events")
      .select("event_id")
      .eq("user_id", userId)
      .in("event_id", eventIds),
  ]);

  const attendance: Record<string, { interested: number; going: number }> = {};
  const myAttendance: Record<string, "interested" | "going" | null> = {};
  ((attendanceRows ?? []) as Array<{ event_id: string; user_id: string; status: "interested" | "going" }>).forEach((row) => {
    if (!attendance[row.event_id]) attendance[row.event_id] = { interested: 0, going: 0 };
    attendance[row.event_id][row.status] += 1;
    if (row.user_id === userId) myAttendance[row.event_id] = row.status;
  });

  return NextResponse.json({
    events: events ?? [],
    attendance,
    myAttendance,
    savedEventIds: ((savedRows ?? []) as Array<{ event_id: string }>).map((row) => row.event_id),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await requireApprovedMember(req, slug);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null) as {
    title?: string;
    description?: string | null;
    date?: string;
    organization?: string | null;
    signup_url?: string | null;
    image_url?: string | null;
    location?: string | null;
    event_time?: string | null;
    poc_name?: string | null;
    poc_phone?: string | null;
  } | null;

  const title = body?.title?.trim();
  const date = body?.date?.trim();
  if (!title || !date) {
    return NextResponse.json({ error: "Title and date are required." }, { status: 400 });
  }

  const { adminClient, unit, userId } = auth;
  const insertRow = {
    user_id: userId,
    title,
    description: body?.description?.trim() || null,
    date,
    organization: body?.organization?.trim() || unit.name,
    signup_url: body?.signup_url?.trim() || null,
    image_url: body?.image_url?.trim() || null,
    location: body?.location?.trim() || null,
    event_time: body?.event_time?.trim() || null,
    poc_name: body?.poc_name?.trim() || null,
    poc_phone: body?.poc_phone?.trim() || null,
    unit_id: unit.id,
    visibility: "group",
  };

  const { data, error } = await adminClient
    .from("events")
    .insert([insertRow])
    .select(EVENT_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const formattedDate = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const wallPostContent = [
    `Added a group event: ${title}`,
    body?.event_time?.trim() ? `Time: ${body.event_time.trim()}` : null,
    `Date: ${formattedDate}`,
    body?.location?.trim() ? `Location: ${body.location.trim()}` : null,
  ].filter(Boolean).join(" · ");

  await adminClient.from("unit_posts").insert({
    unit_id: unit.id,
    user_id: userId,
    post_type: "post",
    content: wallPostContent,
    photo_url: body?.image_url?.trim() || null,
    meta: { source: "group_event_create", event_id: data.id },
  });

  return NextResponse.json({ event: data });
}
