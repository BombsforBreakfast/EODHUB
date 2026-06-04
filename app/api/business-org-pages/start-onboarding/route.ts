import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  authEmailMatchesLinkedEmail,
  normalizeBusinessOrgEmail,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

const ONBOARDING_SESSION_MS = 45 * 60 * 1000;
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
  const user = await authenticate(req);
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { linkedAccountEmail?: unknown };
  const linkedAccountEmail = normalizeBusinessOrgEmail(body.linkedAccountEmail);
  if (!linkedAccountEmail) {
    return NextResponse.json({ error: "A valid linked EOD-HUB account email is required." }, { status: 400 });
  }

  if (!authEmailMatchesLinkedEmail(user.email, linkedAccountEmail)) {
    return NextResponse.json(
      { error: "Sign in must match the validated EOD-HUB user email before business onboarding can continue." },
      { status: 403 },
    );
  }

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const validation = await validateBusinessOrgOwnerEmailByAuth(client, linkedAccountEmail);
  if (!validation.ok || validation.userId !== user.id) {
    return NextResponse.json(
      { error: validation.ok ? "Authenticated user does not match the validated linked email." : validation.message },
      { status: 403 },
    );
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ONBOARDING_SESSION_MS).toISOString();
  const { error: sessionError } = await client
    .from("business_org_onboarding_sessions")
    .insert({
      token,
      owner_user_id: user.id,
      linked_account_email: linkedAccountEmail,
      expires_at: expiresAt,
    });
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 });

  const response = NextResponse.json({
    ok: true,
    redirectTo: `/business-org/onboarding?linked_email=${encodeURIComponent(linkedAccountEmail)}`,
  });
  response.cookies.set(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(ONBOARDING_SESSION_MS / 1000),
  });
  return response;
}
