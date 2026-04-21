import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
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
  const { slug } = await params;

  const { data: unit, error } = await adminClient
    .from("units")
    .select("id, name, slug, description, cover_photo_url, type, created_by")
    .eq("slug", slug)
    .single();

  if (error || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { count } = await adminClient
    .from("unit_members")
    .select("user_id", { count: "exact", head: true })
    .eq("unit_id", unit.id)
    .eq("status", "approved");

  return NextResponse.json({ unit: { ...unit, member_count: count ?? 0 } });
}
