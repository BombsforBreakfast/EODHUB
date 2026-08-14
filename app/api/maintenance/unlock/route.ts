import { NextRequest, NextResponse } from "next/server";
import {
  LOGIN_MAINTENANCE_COOKIE,
  createLoginMaintenanceUnlockCookie,
  isLoginMaintenanceGateEnabled,
  isLoginMaintenancePasswordValid,
  loginMaintenanceCookieOptions,
} from "@/app/lib/server/loginMaintenanceGate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isLoginMaintenanceGateEnabled()) {
    return NextResponse.json({ unlocked: true });
  }

  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!isLoginMaintenancePasswordValid(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  const res = NextResponse.json({ unlocked: true });
  res.cookies.set(
    LOGIN_MAINTENANCE_COOKIE,
    createLoginMaintenanceUnlockCookie(),
    loginMaintenanceCookieOptions(),
  );
  return res;
}
