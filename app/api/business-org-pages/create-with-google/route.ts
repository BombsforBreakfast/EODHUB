import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  BUSINESS_ORG_PAGE_SELECT,
  parseBusinessOrgPageInput,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";
const OWNER_SESSION_COOKIE = "business_org_owner_session";

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
  const businessAuthUser = await authenticate(req);
  if (!businessAuthUser?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseBusinessOrgPageInput({
    ...body,
    business_email: body.business_email ?? businessAuthUser.email,
    business_login_email: businessAuthUser.email,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const onboardingToken = req.cookies.get(OWNER_SESSION_COOKIE)?.value ?? "";
  const { data: ownerSession, error: ownerSessionError } = await client
    .from("business_org_onboarding_sessions")
    .select("token, owner_user_id, linked_account_email, expires_at, consumed_at")
    .eq("token", onboardingToken)
    .maybeSingle();
  if (
    ownerSessionError ||
    !ownerSession ||
    ownerSession.consumed_at ||
    new Date(ownerSession.expires_at).getTime() < Date.now() ||
    ownerSession.linked_account_email.trim().toLowerCase() !== parsed.input.linked_account_email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "Owner authorization expired. Please validate and sign in as the EOD-HUB owner account again." },
      { status: 401 },
    );
  }

  const ownerValidation = await validateBusinessOrgOwnerEmailByAuth(client, parsed.input.linked_account_email);
  if (!ownerValidation.ok) {
    return NextResponse.json({ error: ownerValidation.message }, { status: 403 });
  }
  if (ownerValidation.userId !== ownerSession.owner_user_id) {
    return NextResponse.json({ error: "Authenticated owner does not match linked email." }, { status: 403 });
  }
  if (businessAuthUser.id === ownerValidation.userId || businessAuthUser.email.trim().toLowerCase() === ownerValidation.authEmail.trim().toLowerCase()) {
    return NextResponse.json(
      { error: "Choose a Google account for the business login that is separate from the linked personal owner account." },
      { status: 400 },
    );
  }

  const { data: existingPage } = await client
    .from("business_organization_pages")
    .select("id")
    .eq("business_auth_user_id", businessAuthUser.id)
    .maybeSingle();
  if (existingPage) {
    return NextResponse.json({ error: "This Google account is already linked to a Business / Organization page." }, { status: 409 });
  }

  await client
    .from("profiles")
    .update({
      account_type: "business_org",
      display_name: parsed.input.business_name,
      company_name: parsed.input.business_name,
      photo_url: parsed.input.logo_url,
      must_complete_onboarding: false,
      email_verified: true,
      admin_verified: true,
      verification_status: "verified",
    })
    .eq("user_id", businessAuthUser.id);

  const { data: page, error: pageError } = await client
    .from("business_organization_pages")
    .insert({
      ...parsed.input,
      owner_user_id: ownerValidation.userId,
      business_auth_user_id: businessAuthUser.id,
      verification_status: "approved",
      is_active: true,
      subscription_status: null,
    })
    .select(BUSINESS_ORG_PAGE_SELECT)
    .single();

  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
  const pageRow = page as unknown as { id: string };

  await client.auth.admin.updateUserById(businessAuthUser.id, {
    app_metadata: {
      ...(businessAuthUser.app_metadata ?? {}),
      account_kind: "business_organization_page",
      owner_user_id: ownerValidation.userId,
      business_org_page_id: pageRow.id,
    },
  });

  await client
    .from("business_org_onboarding_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token", onboardingToken);

  const response = NextResponse.json({
    ok: true,
    page,
    redirectTo: `/login?business_page_created=1&email=${encodeURIComponent(businessAuthUser.email)}`,
  });
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
