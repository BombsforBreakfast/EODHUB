import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  BUSINESS_ORG_PAGE_SELECT,
  authEmailMatchesLinkedEmail,
  type BusinessOrgPageRow,
} from "@/app/lib/businessOrgPages";

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
  const { data: profile } = await client
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return profile?.is_admin ? { user, client } : null;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateAdmin(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const LISTED_PAGE_SELECT =
    "id, business_name, description, business_email, linked_account_email, logo_url, website_url, location, page_type, verification_status, subscription_status, is_active, created_at";

  const [pagesRes, listedPagesRes, pausedPagesRes, claimsRes] = await Promise.all([
    auth.client
      .from("business_organization_pages")
      .select(BUSINESS_ORG_PAGE_SELECT)
      .in("verification_status", ["pending", "needs_revalidation"])
      .order("created_at", { ascending: false }),
    auth.client
      .from("business_organization_pages")
      .select(LISTED_PAGE_SELECT)
      .eq("verification_status", "approved")
      .eq("is_active", true)
      .order("business_name", { ascending: true }),
    auth.client
      .from("business_organization_pages")
      .select(LISTED_PAGE_SELECT)
      .eq("verification_status", "approved")
      .eq("is_active", false)
      .order("business_name", { ascending: true }),
    auth.client
      .from("business_org_claim_requests")
      .select("id, business_listing_id, business_org_page_id, requested_by, status, created_at, business_listings(business_name, og_title, website_url), business_organization_pages(business_name, business_email, linked_account_email, logo_url)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  if (pagesRes.error) return NextResponse.json({ error: pagesRes.error.message }, { status: 500 });
  if (listedPagesRes.error) return NextResponse.json({ error: listedPagesRes.error.message }, { status: 500 });
  if (pausedPagesRes.error) return NextResponse.json({ error: pausedPagesRes.error.message }, { status: 500 });
  if (claimsRes.error) return NextResponse.json({ error: claimsRes.error.message }, { status: 500 });

  const pages = await Promise.all(
    ((pagesRes.data ?? []) as unknown as BusinessOrgPageRow[]).map(async (page) => {
      const { data: authData } = await auth.client.auth.admin.getUserById(page.owner_user_id);
      const ownerAuthEmail = authData?.user?.email ?? null;
      return {
        ...page,
        owner_auth_email: ownerAuthEmail,
        linked_email_matches_account: authEmailMatchesLinkedEmail(ownerAuthEmail, page.linked_account_email),
      };
    }),
  );

  return NextResponse.json({
    pages,
    listedPages: listedPagesRes.data ?? [],
    pausedPages: pausedPagesRes.data ?? [],
    claims: claimsRes.data ?? [],
  });
}
