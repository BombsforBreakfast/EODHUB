import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const adminClient = getAdminClient();
  const { slug } = await params;

  const { data: unit, error } = await adminClient
    .from("units")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !unit) {
    return NextResponse.json({ error: "Unit not found" }, { status: 404 });
  }

  const { count } = await adminClient
    .from("unit_members")
    .select("*", { count: "exact", head: true })
    .eq("unit_id", unit.id)
    .eq("status", "approved");

  return NextResponse.json({ unit: { ...unit, member_count: count ?? 0 } });
}
