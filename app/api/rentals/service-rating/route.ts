import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reviewPageOptions } from "@/app/lib/rentals/serviceRatings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cookieName = "eod_listing_service_rater";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const database = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const publicFields = "review_id, score, display_name, testimonial, is_pinned, created_at, updated_at";

async function isAdmin(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const db = database();
  const { data, error } = await db.auth.getUser(header.slice(7));
  if (error || !data.user) return false;
  const profile = await db.from("profiles").select("is_admin").eq("user_id", data.user.id).maybeSingle();
  return !profile.error && profile.data?.is_admin === true;
}

async function summary(req: NextRequest, visitorId: string) {
  const db = database();
  const [aggregate, personal, reviews, canManage] = await Promise.all([
    db.rpc("listing_service_rating_overview"),
    db.from("listing_service_ratings").select("score, display_name, testimonial").eq("visitor_id", visitorId).maybeSingle(),
    db.from("listing_service_ratings").select(publicFields).order("is_pinned", { ascending: false }).order("score", { ascending: false }).order("created_at", { ascending: false }).order("review_id").limit(3),
    isAdmin(req),
  ]);
  if (aggregate.error || personal.error || reviews.error) throw new Error("Ratings unavailable");
  const row = aggregate.data?.[0];
  const response = NextResponse.json({ average: row?.average == null ? null : Number(row.average), count: Number(row?.rating_count ?? 0), mine: personal.data?.score ?? null, displayName: personal.data?.display_name ?? "", testimonial: personal.data?.testimonial ?? "", reviews: reviews.data, distribution: row?.distribution ?? [], canManage }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(cookieName, visitorId, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/rentals/service-rating", maxAge: 31536000 });
  return response;
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(cookieName)?.value ?? "";
  try {
    if (req.nextUrl.searchParams.get("view") === "all") {
      const { sort, offset, pageSize } = reviewPageOptions(req.nextUrl.searchParams);
      let query = database().from("listing_service_ratings").select(publicFields, { count: "exact" });
      if (sort === "featured") query = query.order("is_pinned", { ascending: false }).order("score", { ascending: false });
      if (sort === "highest" || sort === "lowest") query = query.order("score", { ascending: sort === "lowest" });
      const result = await query.order("created_at", { ascending: false }).order("review_id").range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;
      const total = result.count ?? 0;
      return NextResponse.json({ reviews: result.data, total, nextOffset: offset + pageSize < total ? offset + pageSize : null }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return await summary(req, uuid.test(cookie) ? cookie : randomUUID());
  }
  catch { return NextResponse.json({ error: "Ratings are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const visitorId = req.cookies.get(cookieName)?.value ?? "";
  if (!uuid.test(visitorId)) return NextResponse.json({ error: "Refresh ratings and try again." }, { status: 400 });
  let score: unknown;
  let displayName = "";
  let testimonial = "";
  try {
    if (Number(req.headers.get("content-length")) > 10000) throw new Error();
    const raw = await req.text();
    if (raw.length > 10000) throw new Error();
    const body = JSON.parse(raw);
    score = body.score;
    if (typeof body.displayName !== "string" || typeof body.testimonial !== "string") throw new Error();
    displayName = body.displayName.trim(); testimonial = body.testimonial.trim();
    if (displayName.length > 60 || testimonial.length > 1200 || ((testimonial || displayName) && body.publishConsent !== true)) throw new Error();
  } catch { return NextResponse.json({ error: "Check your testimonial and publication consent." }, { status: 400 }); }
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0.5 || score > 5 || !Number.isInteger(score * 2)) return NextResponse.json({ error: "Choose 0.5 to 5 bombs in half-bomb steps." }, { status: 400 });
  try {
    const db = database();
    const previous = await db.from("listing_service_ratings").select("updated_at").eq("visitor_id", visitorId).maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data && Date.now() - Date.parse(previous.data.updated_at) < 5000) return NextResponse.json({ error: "Wait a few seconds before updating your rating." }, { status: 429 });
    const { error } = await db.from("listing_service_ratings").upsert({ visitor_id: visitorId, score, display_name: displayName, testimonial, updated_at: new Date().toISOString() }, { onConflict: "visitor_id" });
    if (error) throw error;
    return await summary(req, visitorId);
  } catch { return NextResponse.json({ error: "Your rating could not be saved. Please try again." }, { status: 503 }); }
}

export async function PATCH(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  try {
    if (!await isAdmin(req)) return NextResponse.json({ error: "Admin sign-in required." }, { status: 403 });
    const body = await req.json();
    if (!uuid.test(body?.reviewId ?? "") || typeof body?.pinned !== "boolean") return NextResponse.json({ error: "Invalid pin request." }, { status: 400 });
    const { data, error } = await database().from("listing_service_ratings").update({ is_pinned: body.pinned }).eq("review_id", body.reviewId).select("review_id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Rating not found." }, { status: 404 });
    const cookie = req.cookies.get(cookieName)?.value ?? "";
    return await summary(req, uuid.test(cookie) ? cookie : randomUUID());
  } catch { return NextResponse.json({ error: "Could not update pinned feedback." }, { status: 503 }); }
}
