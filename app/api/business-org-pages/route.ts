import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  BUSINESS_ORG_PAGE_SELECT,
  authEmailMatchesLinkedEmail,
  parseBusinessOrgPageInput,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { user: null, error: "Unauthorized" };
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  return { user, error: user ? null : "Unauthorized" };
}

export async function GET(req: NextRequest) {
  const { user } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const { data, error } = await client
    .from("business_organization_pages")
    .select(BUSINESS_ORG_PAGE_SELECT)
    .or(`owner_user_id.eq.${user.id},business_auth_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: profile } = await client
    .from("profiles")
    .select("account_type")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    pages: data ?? [],
    authEmail: user.email ?? null,
    accountType: profile?.account_type ?? null,
  });
}

export async function POST(req: NextRequest) {
  const { user } = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = parseBusinessOrgPageInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 });

  if (!authEmailMatchesLinkedEmail(user.email, parsed.input.linked_account_email)) {
    return NextResponse.json(
      { error: "The linked EOD-HUB account email must match your authenticated EOD-HUB account email." },
      { status: 400 },
    );
  }

  const validation = await validateBusinessOrgOwnerEmailByAuth(client, parsed.input.linked_account_email);
  if (!validation.ok || validation.userId !== user.id) {
    return NextResponse.json(
      { error: validation.ok ? "The linked EOD-HUB account email must match your authenticated EOD-HUB account email." : validation.message },
      { status: validation.ok ? 400 : 403 },
    );
  }

  const { data, error } = await client
    .from("business_organization_pages")
    .insert({
      ...parsed.input,
      owner_user_id: user.id,
      verification_status: "approved",
      is_active: true,
      subscription_status: null,
    })
    .select(BUSINESS_ORG_PAGE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data }, { status: 201 });
}
