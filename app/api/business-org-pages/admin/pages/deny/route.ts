import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";

export const dynamic = "force-dynamic";

async function authenticateAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;

  const { client } = createSupabaseServiceRoleClient();
  if (!client) return null;
  const { data: profile } = await client.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  return profile?.is_admin ? { user, client } : null;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { pageId?: unknown; adminNote?: unknown };
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ error: "Page id is required." }, { status: 400 });

  const { error } = await auth.client
    .from("business_organization_pages")
    .update({
      verification_status: "denied",
      is_active: false,
      admin_note: typeof body.adminNote === "string" ? body.adminNote.trim() || null : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
    })
    .eq("id", pageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
