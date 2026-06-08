import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ARCADE_UNLOCK_COOKIE,
  canUseArcadePreview,
  getArcadeAccessPassword,
  hasArcadeRouteAccess,
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.is_admin === true;
  const canClick = canUseArcadePreview(user.id, isAdmin);
  const cookieStore = await cookies();
  const unlockCookie = cookieStore.get(ARCADE_UNLOCK_COOKIE)?.value;
  const unlocked = hasArcadeRouteAccess(user.id, isAdmin, unlockCookie);
  const requiresPassword = canClick && !isAdmin && !!getArcadeAccessPassword();

  return NextResponse.json({ canClick, unlocked, requiresPassword, isAdmin });
}
