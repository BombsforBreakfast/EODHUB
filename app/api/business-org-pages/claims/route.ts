import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  loadBusinessOrgPageForOwner,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  let body: { pageId?: unknown; listingId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const listingId = typeof body.listingId === "string" ? body.listingId : "";
  if (!pageId || !listingId) {
    return NextResponse.json({ error: "Page and listing are required." }, { status: 400 });
  }

  const page = await loadBusinessOrgPageForOwner(client, pageId, user.id);
  if (!page) return NextResponse.json({ error: "Business page not found." }, { status: 404 });
  if (!page.is_active || page.verification_status !== "approved") {
    return NextResponse.json({ error: "This business page must be approved before it can claim listings." }, { status: 403 });
  }
  const { data: listing, error: listingError } = await client
    .from("business_listings")
    .select("id, is_approved, listing_type, claimed_business_org_page_id, managed_by_user_id")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) return NextResponse.json({ error: listingError.message }, { status: 500 });
  if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  if (listing.is_approved !== true || !["business", "organization"].includes(String(listing.listing_type ?? ""))) {
    return NextResponse.json({ error: "This listing is not eligible for page claims." }, { status: 400 });
  }
  if (listing.claimed_business_org_page_id) {
    return NextResponse.json({ error: "This listing is already linked to a business page." }, { status: 409 });
  }
  if (listing.managed_by_user_id && listing.managed_by_user_id !== page.owner_user_id) {
    return NextResponse.json({ error: "This listing is managed by another account." }, { status: 403 });
  }

  const { data, error } = await client
    .from("business_org_claim_requests")
    .insert({
      business_listing_id: listingId,
      business_org_page_id: pageId,
      requested_by: user.id,
      status: "pending",
    })
    .select("id, business_listing_id, business_org_page_id, requested_by, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ claim: data }, { status: 201 });
}
