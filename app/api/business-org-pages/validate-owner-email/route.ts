import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { checkRateLimit, getClientIp } from "@/app/lib/server/rateLimit";
import {
  normalizeBusinessOrgEmail,
  validateBusinessOrgOwnerEmailByAuth,
} from "@/app/lib/businessOrgPages";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`business-org-owner-email:${ip}`, {
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.allowed) {
    return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 429 });
  }

  let body: { email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, status: "invalid_email" }, { status: 400 });
  }

  const normalizedEmail = normalizeBusinessOrgEmail(body.email);
  if (!normalizedEmail) {
    return NextResponse.json({
      ok: false,
      status: "invalid_email",
      message: "Please enter a valid email address.",
    });
  }

  const emailLimited = checkRateLimit(`business-org-owner-email:${normalizedEmail}`, {
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!emailLimited.allowed) {
    return NextResponse.json({ ok: false, status: "rate_limited" }, { status: 429 });
  }

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    return NextResponse.json({ ok: false, status: "lookup_failed" }, { status: 503 });
  }

  const validation = await validateBusinessOrgOwnerEmailByAuth(client, normalizedEmail);
  if (!validation.ok) {
    return NextResponse.json({
      ok: false,
      status: validation.code,
      message: validation.message,
    });
  }

  return NextResponse.json({
    ok: true,
    status: "found",
    email: validation.normalizedEmail,
  });
}
