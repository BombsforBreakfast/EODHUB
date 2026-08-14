import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  LOGIN_MAINTENANCE_COOKIE,
  isLoginMaintenanceGateEnabled,
  verifyLoginMaintenanceUnlockCookie,
} from "@/app/lib/server/loginMaintenanceGate";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = isLoginMaintenanceGateEnabled();
  if (!enabled) {
    return NextResponse.json({ enabled: false, unlocked: true });
  }

  const cookieStore = await cookies();
  const unlocked = verifyLoginMaintenanceUnlockCookie(
    cookieStore.get(LOGIN_MAINTENANCE_COOKIE)?.value,
  );

  return NextResponse.json({ enabled: true, unlocked });
}
