import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { runEmailDigest, type DigestType } from "@/app/lib/server/emailDigest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function isDigestType(value: unknown): value is DigestType {
  return value === "morning" || value === "evening";
}

async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.DIGEST_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DIGEST_CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!constantTimeEquals(auth.slice(7), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

async function handle(req: NextRequest) {
  const unauthorized = await authorize(req);
  if (unauthorized) return unauthorized;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  } else {
    body = {
      digestType: req.nextUrl.searchParams.get("digestType"),
      dryRun: req.nextUrl.searchParams.get("dryRun") === "true",
      batchSize: req.nextUrl.searchParams.get("batchSize"),
    };
  }

  if (!isDigestType(body.digestType)) {
    return NextResponse.json(
      { error: "digestType must be 'morning' or 'evening'" },
      { status: 400 },
    );
  }

  const batchSize =
    typeof body.batchSize === "number"
      ? body.batchSize
      : typeof body.batchSize === "string"
        ? Number(body.batchSize)
        : undefined;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const result = await runEmailDigest(adminClient, {
    digestType: body.digestType,
    dryRun: body.dryRun === true,
    batchSize,
    origin: req.nextUrl.origin,
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
