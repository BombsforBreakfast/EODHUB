import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function secretMatches(submitted: string, expected: string): boolean {
  const hashA = createHash("sha256").update(submitted, "utf8").digest();
  const hashB = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

export async function POST(req: NextRequest) {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const submitted = typeof body.code === "string" ? body.code.trim() : "";
  if (!submitted) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const expected = (process.env.BETA_ACCESS_CODE ?? "").trim();
  if (!expected) {
    return NextResponse.json({ success: false }, { status: 503 });
  }

  if (secretMatches(submitted, expected)) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false }, { status: 403 });
}
