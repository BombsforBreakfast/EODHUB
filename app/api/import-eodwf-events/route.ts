import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runEodwfEventsImport } from "@/app/lib/eodwf/runImport";

export const runtime = "nodejs";
export const maxDuration = 300;

async function authorizeImport(req: NextRequest): Promise<
  | { ok: true; via: "cron" | "admin" }
  | { ok: false; status: number; error: string }
> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const querySecret = req.nextUrl.searchParams.get("secret");

  if (
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && querySecret === cronSecret)
  ) {
    return { ok: true, via: "cron" };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, via: "admin" };
}

async function handle(req: NextRequest) {
  const auth = await authorizeImport(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const summary = await runEodwfEventsImport(admin);
    return NextResponse.json({ ok: true, via: auth.via, ...summary });
  } catch (err) {
    console.error("[import-eodwf-events]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
