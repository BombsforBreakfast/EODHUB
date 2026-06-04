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

  const body = (await req.json().catch(() => ({}))) as {
    claimId?: unknown;
    action?: unknown;
    adminNote?: unknown;
  };
  const claimId = typeof body.claimId === "string" ? body.claimId : "";
  const action = body.action === "approve" || body.action === "deny" ? body.action : null;
  if (!claimId || !action) {
    return NextResponse.json({ error: "Claim id and action are required." }, { status: 400 });
  }

  const { data: claim, error: claimError } = await auth.client
    .from("business_org_claim_requests")
    .select("id, business_listing_id, business_org_page_id, status")
    .eq("id", claimId)
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (claim.status !== "pending") return NextResponse.json({ error: "Claim is no longer pending." }, { status: 409 });

  const now = new Date().toISOString();
  const note = typeof body.adminNote === "string" ? body.adminNote.trim() || null : null;

  if (action === "deny") {
    const { error } = await auth.client
      .from("business_org_claim_requests")
      .update({ status: "denied", admin_note: note, reviewed_at: now, reviewed_by: auth.user.id })
      .eq("id", claimId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error: listingError } = await auth.client
    .from("business_listings")
    .update({ claimed_business_org_page_id: claim.business_org_page_id })
    .eq("id", claim.business_listing_id)
    .is("claimed_business_org_page_id", null);
  if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500 });

  const { error: pageError } = await auth.client
    .from("business_organization_pages")
    .update({ claimed_business_listing_id: claim.business_listing_id })
    .eq("id", claim.business_org_page_id);
  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });

  const { error: approveError } = await auth.client
    .from("business_org_claim_requests")
    .update({ status: "approved", admin_note: note, reviewed_at: now, reviewed_by: auth.user.id })
    .eq("id", claimId);
  if (approveError) return NextResponse.json({ error: approveError.message }, { status: 500 });

  await auth.client
    .from("business_org_claim_requests")
    .update({ status: "denied", admin_note: "Another page claim was approved for this listing.", reviewed_at: now, reviewed_by: auth.user.id })
    .eq("business_listing_id", claim.business_listing_id)
    .eq("status", "pending")
    .neq("id", claimId);

  return NextResponse.json({ ok: true });
}
