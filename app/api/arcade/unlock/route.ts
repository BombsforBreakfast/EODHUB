import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  arcadeUnlockCookieOptions,
  ARCADE_UNLOCK_COOKIE,
  canUseArcadePreview,
  createArcadeUnlockCookieValue,
  getArcadeAccessPassword,
  isArcadeAccessPasswordValid,
} from "@/app/lib/server/arcadeAccess";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  const isAdmin = profile?.is_admin === true;
  if (!canUseArcadePreview(user.id, isAdmin)) {
    return NextResponse.json({ error: "Arcade preview is not available for this account." }, { status: 403 });
  }

  if (isAdmin) {
    return NextResponse.json({ unlocked: true });
  }

  if (!getArcadeAccessPassword()) {
    return NextResponse.json({ error: "Arcade preview password is not configured." }, { status: 503 });
  }

  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!isArcadeAccessPasswordValid(password)) {
    return NextResponse.json({ error: "Incorrect preview password." }, { status: 403 });
  }

  const res = NextResponse.json({ unlocked: true });
  res.cookies.set(ARCADE_UNLOCK_COOKIE, createArcadeUnlockCookieValue(user.id), arcadeUnlockCookieOptions());
  return res;
}
