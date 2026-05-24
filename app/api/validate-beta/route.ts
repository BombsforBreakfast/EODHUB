import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getBetaAccessCode,
  isBetaAccessGranted,
  jsonWithBetaAccessCookie,
} from "@/app/lib/server/betaAccess";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

function secretMatches(submitted: string, expected: string): boolean {
  const hashA = createHash("sha256").update(submitted, "utf8").digest();
  const hashB = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ granted: isBetaAccessGranted(req) });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`validate-beta:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, message: rateLimitResponse(limited.retryAfterSec).message },
      { status: 429 },
    );
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }

  const submittedCode = typeof body.code === "string" ? body.code.trim() : "";

  if (!submittedCode) {
    return NextResponse.json(
      { success: false, message: "Please enter an access code." },
      { status: 400 },
    );
  }

  const expected = getBetaAccessCode();
  if (!expected) {
    return NextResponse.json({ success: false }, { status: 503 });
  }

  const codeOk = secretMatches(submittedCode, expected);
  if (codeOk) {
    return jsonWithBetaAccessCookie({ success: true });
  }

  return NextResponse.json(
    { success: false, message: "Access code is incorrect." },
    { status: 401 },
  );
}
