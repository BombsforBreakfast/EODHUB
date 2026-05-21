import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { devAuthLog } from "@/app/lib/auth/signupErrors";
import { sendVerificationEmailForUser } from "@/app/lib/server/sendVerificationEmail";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
} from "@/app/lib/server/rateLimit";

export const dynamic = "force-dynamic";

const GENERIC_OK = { ok: true as const };

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(GENERIC_OK);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("send-verification-email: missing SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(GENERIC_OK);
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData } = await userClient.auth.getUser();
  const user = authData?.user;
  if (!user?.id) {
    return NextResponse.json(GENERIC_OK);
  }

  const limitedUser = checkRateLimit(`verify-email-send:user:${user.id}`, {
    limit: 3,
    windowMs: 15 * 60 * 1000,
  });
  const limitedIp = checkRateLimit(`verify-email-send:ip:${ip}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (!limitedUser.allowed || !limitedIp.allowed) {
    return NextResponse.json(rateLimitResponse(limitedUser.retryAfterSec ?? limitedIp.retryAfterSec), {
      status: 429,
    });
  }

  const result = await sendVerificationEmailForUser(user.id, req.nextUrl.origin);

  if (process.env.NODE_ENV === "development") {
    devAuthLog("send-verification-email-route", { userId: user.id, result });
  }

  return NextResponse.json(GENERIC_OK);
}
