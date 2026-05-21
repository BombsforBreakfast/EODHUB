import { NextRequest, NextResponse } from "next/server";
import { verifyTurnstileToken } from "@/app/lib/server/turnstile";
import { getClientIp } from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let token: unknown;
  try {
    const body = await req.json();
    token = (body as { token?: unknown })?.token;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  if (typeof token !== "string" || !token) {
    return NextResponse.json(
      { success: false, error: "Missing token" },
      { status: 400 },
    );
  }

  const result = await verifyTurnstileToken(token, getClientIp(req));
  if (result.ok) {
    return NextResponse.json({ success: true });
  }

  if (result.reason === "missing_secret") {
    // Misconfigured: fail closed so bot protection is never silently bypassed.
    return NextResponse.json(
      { success: false, error: "Turnstile is not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { success: false, error: "Verification failed" },
    { status: 403 },
  );
}
