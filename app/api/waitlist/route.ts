import { NextRequest, NextResponse } from "next/server";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import { createSupabaseServiceRoleClient } from "@/app/lib/auth/adminAuthLookup";
import { domainHasMxRecords } from "@/app/lib/server/emailMxCheck";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const MAX_NAME = 80;
const MAX_SERVICE = 64;

function clampOptionalString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const limited = checkRateLimit(`waitlist:${ip}`, { limit: 5, windowMs: 15 * 60 * 1000 });
  if (!limited.allowed) {
    return NextResponse.json(rateLimitResponse(limited.retryAfterSec), { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  const validated = validateEmailForRegistration(emailRaw);
  if (!validated.ok) {
    return NextResponse.json({ ok: false, message: validated.message }, { status: 400 });
  }

  const domain = validated.email.split("@")[1];
  if (domain && !(await domainHasMxRecords(domain))) {
    return NextResponse.json(
      { ok: false, message: "Please use a real email address." },
      { status: 400 },
    );
  }

  const { client, error: envErr } = createSupabaseServiceRoleClient();
  if (envErr || !client) {
    return NextResponse.json(
      { ok: false, message: "Something went wrong. Please try again in a moment." },
      { status: 503 },
    );
  }

  const row = {
    email: validated.email,
    first_name: clampOptionalString(body.first_name, MAX_NAME) || null,
    last_name: clampOptionalString(body.last_name, MAX_NAME) || null,
    service: clampOptionalString(body.service, MAX_SERVICE) || null,
  };

  const { error } = await client.from("waitlist_signups").insert(row);
  if (error) {
    const dup = error.code === "23505" || /duplicate|unique/i.test(error.message ?? "");
    if (dup) {
      return NextResponse.json(
        { ok: false, message: "That email is already on the waitlist." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, message: "Something went wrong. Please try again in a moment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
