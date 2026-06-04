import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { BUSINESS_ORG_PAGE_SELECT, type BusinessOrgPageRow } from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

async function getRequestUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await userClient.auth.getUser();
  return data.user ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: "User id is required." }, { status: 400 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data: page, error: pageError } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .eq("business_auth_user_id", userId)
    .maybeSingle();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const businessPage = (page as unknown as BusinessOrgPageRow | null) ?? null;
  if (!businessPage) return NextResponse.json({ page: null });

  if (businessPage.is_active === true && businessPage.verification_status === "approved") {
    return NextResponse.json({ page: businessPage });
  }

  const requestUser = await getRequestUser(req);
  const { data: requesterProfile } = requestUser
    ? await client
      .from("profiles")
      .select("is_admin, is_pure_admin")
      .eq("user_id", requestUser.id)
      .maybeSingle()
    : { data: null };

  const canViewPrivatePage =
    requestUser?.id === businessPage.business_auth_user_id ||
    requestUser?.id === businessPage.owner_user_id ||
    requesterProfile?.is_admin === true ||
    requesterProfile?.is_pure_admin === true;

  if (!canViewPrivatePage) return NextResponse.json({ page: null });

  return NextResponse.json({ page: businessPage });
}
