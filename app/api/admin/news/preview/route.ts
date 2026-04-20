import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { previewNewsIngestion, insertManualCandidate, type PreviewCandidate } from "../../../../lib/news/runner";

// Admin-only diagnostic endpoint.
//   GET    → run the full fetch + score pipeline read-only and return EVERY
//            candidate (passed, dropped, duplicate) so the admin can audit
//            scoring decisions and tune keyword lists.
//   POST   → force-insert a single preview candidate as `pending`, bypassing
//            the scorer. Used to recover relevant items the gate dropped.
//   DELETE → add one or more candidate dedupe_keys to the persistent blocklist
//            so they never re-enter the pipeline. Body:
//              { items: Array<{ dedupe_key, headline?, source_url?, source_name? }>, reason? }

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorizeAdmin(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "Unauthorized" as const, status: 401 };
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return { error: "Unauthorized" as const, status: 401 };
  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { error: "Forbidden" as const, status: 403 };
  return { ok: true as const, userId: authData.user.id };
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = serviceClient();
  const result = await previewNewsIngestion(supabase);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as
    | { candidate?: PreviewCandidate; candidates?: PreviewCandidate[] }
    | null;

  // Accept either { candidate } (legacy single) or { candidates } (bulk).
  const list: PreviewCandidate[] = body?.candidates
    ? body.candidates
    : body?.candidate
    ? [body.candidate]
    : [];

  const valid = list.filter(
    (c) => c && typeof c.headline === "string" && typeof c.source_url === "string" && typeof c.dedupe_key === "string"
  );
  if (valid.length === 0) {
    return NextResponse.json({ error: "Invalid candidate payload" }, { status: 400 });
  }
  if (valid.length > 200) {
    return NextResponse.json({ error: "Too many candidates in one call" }, { status: 400 });
  }

  const supabase = serviceClient();
  let inserted = 0;
  const errors: string[] = [];
  // Sequential keeps logic simple and stays well within 60s for ≤200 rows;
  // each call is a single upsert with ON CONFLICT DO NOTHING.
  for (const c of valid) {
    const out = await insertManualCandidate(supabase, c);
    if (out.inserted) inserted += 1;
    else if (out.error) errors.push(out.error);
  }

  return NextResponse.json({
    ok: true,
    inserted,
    requested: valid.length,
    errors: errors.slice(0, 10),
  });
}

type DismissItem = {
  dedupe_key: string;
  headline?: string | null;
  source_url?: string | null;
  source_name?: string | null;
};

export async function DELETE(req: NextRequest) {
  const auth = await authorizeAdmin(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as
    | { items?: DismissItem[]; reason?: string }
    | null;
  const items = body?.items ?? [];
  if (items.length === 0) {
    return NextResponse.json({ error: "items[] required" }, { status: 400 });
  }
  // Cap defensively — a single dismiss-all click could send hundreds, but
  // PostgREST happily handles a few thousand and our table is tiny.
  if (items.length > 5_000) {
    return NextResponse.json({ error: "Too many items in one call" }, { status: 400 });
  }

  const reason = body?.reason ?? "preview_dismiss";
  const rows = items
    .filter((i) => typeof i.dedupe_key === "string" && i.dedupe_key.length > 0)
    .map((i) => ({
      dedupe_key: i.dedupe_key,
      headline: i.headline ?? null,
      source_url: i.source_url ?? null,
      source_name: i.source_name ?? null,
      reason,
      blocked_by: auth.userId,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid dedupe_keys" }, { status: 400 });
  }

  const supabase = serviceClient();
  const { error } = await supabase
    .from("news_blocked_dedupe_keys")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, blocked: rows.length });
}
