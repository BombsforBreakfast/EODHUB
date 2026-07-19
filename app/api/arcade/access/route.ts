import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ARCADE_UNLOCK_COOKIE,
  canUseArcadePreview,
  getArcadeAccessPassword,
  hasArcadeRouteAccess,
  isNativeIosArcadeRequest,
} from "@/app/lib/server/arcadeAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ canClick: false, unlocked: false, requiresPassword: false }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ canClick: false, unlocked: false, requiresPassword: false }, { status: 503 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ canClick: false, unlocked: false, requiresPassword: false }, { status: 401 });
  }

  const nativeIos = isNativeIosArcadeRequest(req);
  const canClick = canUseArcadePreview(user.id, { nativeIos });
  const cookieStore = await cookies();
  const unlockCookie = cookieStore.get(ARCADE_UNLOCK_COOKIE)?.value;
  const unlocked = hasArcadeRouteAccess(user.id, unlockCookie, { nativeIos });
  const requiresPassword = canClick && !unlocked && !!getArcadeAccessPassword();

  return NextResponse.json({ canClick, unlocked, requiresPassword, nativeIos });
}
