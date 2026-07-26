import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isCollapsingCircuitEnabled } from "@/app/lib/circuit";

function adminClients(token: string) {
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return { userClient, adminClient };
}

async function requireAdmin(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const token = authHeader.slice(7);
  const { userClient, adminClient } = adminClients(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { adminClient };
}

export async function GET(req: NextRequest) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }
  const auth = await requireAdmin(req);
  if ("error" in auth && auth.error) return auth.error;

  const { data: prompts, error } = await auth.adminClient!
    .from("circuit_prompts")
    .select("id, slug, label, sort_hint, is_active, created_at")
    .order("sort_hint", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (prompts ?? []).map((p) => p.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: posts } = await auth.adminClient!
      .from("circuit_posts")
      .select("prompt_id")
      .in("prompt_id", ids);
    for (const row of posts ?? []) {
      if (!row.prompt_id) continue;
      counts.set(row.prompt_id, (counts.get(row.prompt_id) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    prompts: (prompts ?? []).map((p) => ({
      ...p,
      post_count: counts.get(p.id) ?? 0,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }
  const auth = await requireAdmin(req);
  if ("error" in auth && auth.error) return auth.error;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    sort_hint?: number;
    is_active?: boolean;
    label?: string;
  } | null;

  if (!body?.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.sort_hint === "number" && Number.isFinite(body.sort_hint)) {
    updates.sort_hint = Math.round(body.sort_hint);
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (label.length < 1 || label.length > 80) {
      return NextResponse.json({ error: "Label must be 1–80 characters." }, { status: 400 });
    }
    updates.label = label;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates." }, { status: 400 });
  }

  const { error } = await auth.adminClient!
    .from("circuit_prompts")
    .update(updates)
    .eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
