import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type PendingGroupSummary = {
  id: string;
  name: string;
  slug: string;
  cover_photo_url: string | null;
  pending_count: number;
};

/**
 * GET /api/units/pending-summary
 * Returns all groups where the caller is owner/admin and have pending join requests.
 * Used to populate the admin inbox on the Groups page and NavBar badge.
 */
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ groups: [] });

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ groups: [] });

  const db = getAdminClient();

  // Find all units where this user is an approved owner or admin
  const { data: adminMemberships } = await db
    .from("unit_members")
    .select("unit_id")
    .eq("user_id", user.id)
    .eq("status", "approved")
    .in("role", ["owner", "admin"]);

  if (!adminMemberships || adminMemberships.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  const unitIds = adminMemberships.map((m: { unit_id: string }) => m.unit_id);

  // Fetch pending member counts for each unit in one query
  const { data: pendingRows } = await db
    .from("unit_members")
    .select("unit_id")
    .in("unit_id", unitIds)
    .eq("status", "pending");

  if (!pendingRows || pendingRows.length === 0) {
    return NextResponse.json({ groups: [] });
  }

  // Count pending per unit
  const pendingByUnit = new Map<string, number>();
  for (const row of pendingRows as { unit_id: string }[]) {
    pendingByUnit.set(row.unit_id, (pendingByUnit.get(row.unit_id) ?? 0) + 1);
  }

  const unitIdsWithPending = Array.from(pendingByUnit.keys());

  // Fetch unit details only for units that have pending requests
  const { data: units } = await db
    .from("units")
    .select("id, name, slug, cover_photo_url")
    .in("id", unitIdsWithPending);

  const groups: PendingGroupSummary[] = (units ?? []).map(
    (u: { id: string; name: string; slug: string; cover_photo_url: string | null }) => ({
      id: u.id,
      name: u.name,
      slug: u.slug,
      cover_photo_url: u.cover_photo_url,
      pending_count: pendingByUnit.get(u.id) ?? 0,
    })
  ).sort((a, b) => b.pending_count - a.pending_count);

  return NextResponse.json({ groups });
}
