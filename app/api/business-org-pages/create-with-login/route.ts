import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import {
  createSupabaseServiceRoleClient,
  findAuthUsersByEmail,
} from "@/app/lib/auth/adminAuthLookup";
import { ensureProfileStubForUser } from "@/app/lib/auth/ensureProfileStub";
import {
  BUSINESS_ORG_PAGE_SELECT,
  authEmailMatchesLinkedEmail,
  parseBusinessOrgPageInput,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const OWNER_SESSION_COOKIE = "business_org_owner_session";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`business-org-create:${ip}`, {
    limit: 6,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again shortly." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const linkedAccountEmail = normalizeEmail(body.linked_account_email);
  const businessLoginEmail = normalizeEmail(body.business_login_email);
  const onboardingToken = req.cookies.get(OWNER_SESSION_COOKIE)?.value ?? "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirm_password === "string" ? body.confirm_password : "";

  if (!linkedAccountEmail) {
    return NextResponse.json({ error: "A validated EOD-HUB user email is required." }, { status: 400 });
  }
  if (!businessLoginEmail) {
    return NextResponse.json({ error: "A valid business login email is required." }, { status: 400 });
  }
  if (businessLoginEmail === linkedAccountEmail) {
    return NextResponse.json({ error: "Business login email must be separate from the linked personal account email." }, { status: 400 });
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX || password !== confirmPassword) {
    return NextResponse.json({ error: "Enter matching business profile passwords between 8 and 128 characters." }, { status: 400 });
  }

  const emailValidation = validateEmailForRegistration(businessLoginEmail);
  if (!emailValidation.ok) {
    return NextResponse.json({ error: "Please use a valid business login email." }, { status: 400 });
  }

  const parsed = parseBusinessOrgPageInput({
    ...body,
    business_email: body.business_email ?? businessLoginEmail,
    linked_account_email: linkedAccountEmail,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

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
    !authEmailMatchesLinkedEmail(ownerSession.linked_account_email, linkedAccountEmail)
  ) {
    return NextResponse.json(
      { error: "Owner authorization expired. Please validate and sign in as the EOD-HUB owner account again." },
      { status: 401 },
    );
  }

  const ownerValidation = await validateBusinessOrgOwnerEmailByAuth(client, linkedAccountEmail);
  if (!ownerValidation.ok || ownerValidation.userId !== ownerSession.owner_user_id) {
    return NextResponse.json({ error: ownerValidation.ok ? "Authenticated owner does not match linked email." : ownerValidation.message }, { status: 403 });
  }

  const existingBusinessUsers = await findAuthUsersByEmail(client, businessLoginEmail);
  if (existingBusinessUsers.users.length > 0) {
    return NextResponse.json({ error: "That business login email already has an EOD-HUB account. Use a different business email or sign in normally." }, { status: 409 });
  }

  const { data: createdAuth, error: createAuthError } = await client.auth.admin.createUser({
    email: businessLoginEmail,
    password,
    email_confirm: true,
    app_metadata: {
      account_kind: "business_organization_page",
      owner_user_id: ownerValidation.userId,
    },
    user_metadata: {
      business_name: parsed.input.business_name,
    },
  });
  if (createAuthError || !createdAuth.user) {
    return NextResponse.json({ error: createAuthError?.message ?? "Could not create business login." }, { status: 400 });
  }

  await ensureProfileStubForUser(client, createdAuth.user.id, businessLoginEmail);
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
    .eq("user_id", createdAuth.user.id);

  const { data: page, error: pageError } = await client
    .from("business_organization_pages")
    .insert({
      ...parsed.input,
      owner_user_id: ownerValidation.userId,
      business_auth_user_id: createdAuth.user.id,
      business_email: parsed.input.business_email,
      verification_status: "approved",
      is_active: true,
      subscription_status: null,
    })
    .select(BUSINESS_ORG_PAGE_SELECT)
    .single();

  if (pageError) {
    await client.auth.admin.deleteUser(createdAuth.user.id);
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }
  const pageRow = page as unknown as { id: string };

  await client.auth.admin.updateUserById(createdAuth.user.id, {
    app_metadata: {
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
    businessLoginEmail,
    redirectTo: `/login?business_page_created=1&email=${encodeURIComponent(businessLoginEmail)}`,
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
