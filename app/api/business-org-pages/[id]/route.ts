import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import {
  BUSINESS_ORG_PAGE_SELECT,
  authEmailMatchesLinkedEmail,
  loadBusinessOrgPageForOwner,
  parseBusinessOrgPageInput,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

export async function PATCH(req: NextRequest, context: RouteContext) {
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) return NextResponse.json({ error: "Server configuration error" }, { status: 503 });

  const current = await loadBusinessOrgPageForOwner(client, id, user.id);
  if (!current) return NextResponse.json({ error: "Page not found" }, { status: 404 });

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
    .update({
      ...parsed.input,
      verification_status: current.verification_status,
      is_active: current.is_active,
    })
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(BUSINESS_ORG_PAGE_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ page: data });
}
