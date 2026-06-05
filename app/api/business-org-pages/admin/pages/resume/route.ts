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

  const body = (await req.json().catch(() => ({}))) as { pageId?: unknown };
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  if (!pageId) return NextResponse.json({ error: "Page id is required." }, { status: 400 });

  const { data: page, error: loadError } = await auth.client
    .from("business_organization_pages")
    .select("id, verification_status, is_active")
    .eq("id", pageId)
    .maybeSingle();
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!page) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  if (page.verification_status !== "approved") {
    return NextResponse.json({ error: "Only approved pages can be resumed." }, { status: 409 });
  }
  if (page.is_active === true) {
    return NextResponse.json({ error: "Page is already listed." }, { status: 409 });
  }

  const { error } = await auth.client
    .from("business_organization_pages")
    .update({ is_active: true })
    .eq("id", pageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
