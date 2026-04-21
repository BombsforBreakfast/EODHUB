import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertMemberInteractionAllowed } from "../../lib/memberSubscriptionServer";

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

const MEMBER_PREVIEW_LIMIT = 5;

const UNIT_MEMBER_ROLE_ORDER: Record<string, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

type UnitMemberRow = {
  unit_id: string;
  user_id: string;
  role: string;
  created_at: string | null;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userClient = getUserClient(token);
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") ?? "";

  let dbQuery = userClient
    .from("units")
    .select("id, name, slug, description, cover_photo_url, type, created_at")
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

  const { data: memberRows, error: membersFetchError } = await userClient
    .from("unit_members")
    .select("unit_id, user_id, role, created_at")
    .in("unit_id", unitIds)
    .eq("status", "approved");

  if (membersFetchError) {
    return NextResponse.json({ error: membersFetchError.message }, { status: 500 });
  }

  const grouped = new Map<string, UnitMemberRow[]>();
  for (const row of (memberRows ?? []) as UnitMemberRow[]) {
    const list = grouped.get(row.unit_id) ?? [];
    list.push(row);
    grouped.set(row.unit_id, list);
  }

  for (const [, list] of grouped) {
    list.sort((a, b) => {
      const ra = UNIT_MEMBER_ROLE_ORDER[a.role] ?? 3;
      const rb = UNIT_MEMBER_ROLE_ORDER[b.role] ?? 3;
      if (ra !== rb) return ra - rb;
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ta - tb;
    });
  }

  const countMap: Record<string, number> = {};
  for (const id of unitIds) {
    countMap[id] = grouped.get(id)?.length ?? 0;
  }

  const previewUserIds = new Set<string>();
  const previewIdsByUnit = new Map<string, string[]>();
  for (const id of unitIds) {
    const list = grouped.get(id) ?? [];
    const ids = list.slice(0, MEMBER_PREVIEW_LIMIT).map((m) => m.user_id);
    previewIdsByUnit.set(id, ids);
    for (const uid of ids) previewUserIds.add(uid);
  }

  type ProfileMini = {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    photo_url: string | null;
  };

  const profileMap: Record<string, ProfileMini> = {};
  if (previewUserIds.size > 0) {
    const { data: profiles, error: profErr } = await userClient
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", [...previewUserIds]);

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    for (const p of (profiles ?? []) as ProfileMini[]) {
      profileMap[p.user_id] = p;
    }
  }

  function previewLabel(p: ProfileMini | undefined): string {
    if (!p) return "Member";
    const dn = (p.display_name ?? "").trim();
    if (dn) return dn;
    const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
    return n || "Member";
  }

  const enriched = filteredUnits.map((u: Record<string, unknown>) => {
    const id = u.id as string;
    const ids = previewIdsByUnit.get(id) ?? [];
    const member_preview = ids.map((user_id) => {
      const prof = profileMap[user_id];
      return {
        user_id,
        photo_url: prof?.photo_url ?? null,
        label: previewLabel(prof),
      };
    });
    return {
      ...u,
      member_count: countMap[id] ?? 0,
      member_preview,
    };
  });

  return NextResponse.json({ units: enriched, searched: q.trim() });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
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
    .select("id, name, slug, description, cover_photo_url, type, created_by, created_at")
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
