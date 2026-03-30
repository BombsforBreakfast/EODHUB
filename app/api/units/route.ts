import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const IS_BETA = true;

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

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(req: NextRequest) {
  const adminClient = getAdminClient();
  const q = req.nextUrl.searchParams.get("q") ?? "";

  let dbQuery = adminClient
    .from("units")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (q.trim()) {
    dbQuery = dbQuery.ilike("name", `%${q.trim()}%`);
  }

  const { data: units, error: unitsError } = await dbQuery;

  if (unitsError) {
    return NextResponse.json({ error: unitsError.message }, { status: 500 });
  }

  const filteredUnits = units ?? [];

  if (filteredUnits.length === 0) {
    return NextResponse.json({ units: [], searched: q.trim() });
  }

  const unitIds = filteredUnits.map((u: { id: string }) => u.id);

  const { data: memberCounts, error: countError } = await adminClient
    .from("unit_members")
    .select("unit_id")
    .in("unit_id", unitIds)
    .eq("status", "approved");

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const countMap: Record<string, number> = {};
  for (const row of memberCounts ?? []) {
    countMap[row.unit_id] = (countMap[row.unit_id] ?? 0) + 1;
  }

  const enriched = filteredUnits.map((u: Record<string, unknown>) => ({
    ...u,
    member_count: countMap[u.id as string] ?? 0,
  }));

  return NextResponse.json({ units: enriched, searched: q.trim() });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = getAdminClient();

  if (!IS_BETA) {
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("subscription_status")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const status = profile.subscription_status;
    if (status !== "active" && status !== "trialing") {
      return NextResponse.json(
        { error: "Active subscription required" },
        { status: 403 }
      );
    }
  }

  const body = await req.json();
  const { name, description, type, cover_photo_url } = body as {
    name: string;
    description?: string;
    type?: string;
    cover_photo_url?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let slug = generateSlug(name);

  const { data: existing } = await adminClient
    .from("units")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  const { data: unit, error: insertError } = await adminClient
    .from("units")
    .insert({
      name: name.trim(),
      description: description ?? null,
      type: type ?? null,
      cover_photo_url: cover_photo_url ?? null,
      slug,
      created_by: user.id,
    })
    .select()
    .single();

  if (insertError || !unit) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create unit" },
      { status: 500 }
    );
  }

  const { error: memberError } = await adminClient.from("unit_members").insert({
    unit_id: unit.id,
    user_id: user.id,
    role: "owner",
    status: "approved",
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ unit }, { status: 201 });
}
