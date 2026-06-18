import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parsePostAsUserIdFromBody,
  POST_AS_ADMIN_EMAIL,
  validatePostAsUserIdForShare,
} from "@/app/lib/postAsIdentity";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function listingKind(value: string | null | undefined): "business" | "organization" | "resource" {
  if (value === "organization" || value === "resource") return value;
  return "business";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userClient = getUserClient(token);
  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shareText = typeof body?.content === "string" ? body.content.trim().slice(0, 4000) : "";
  const parsedPostAsUserId = parsePostAsUserIdFromBody(body);
  if (parsedPostAsUserId === "invalid") {
    return NextResponse.json({ error: "Invalid post-as identity." }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const { data: adminProfile } = await adminClient
    .from("profiles")
    .select("user_id")
    .eq("email", POST_AS_ADMIN_EMAIL)
    .maybeSingle();

  const postAsValidation = validatePostAsUserIdForShare({
    callerEmail: user.email ?? null,
    callerUserId: user.id,
    requestedPostAsUserId: parsedPostAsUserId,
    adminUserId: adminProfile?.user_id ?? null,
  });
  if (!postAsValidation.ok) {
    return NextResponse.json({ error: postAsValidation.error }, { status: postAsValidation.status });
  }

  const { id: listingId } = await params;
  const { data: listing, error: listingErr } = await adminClient
    .from("business_listings")
    .select("id, business_name, website_url, custom_blurb, og_title, og_description, og_image, og_site_name, is_approved, listing_type")
    .eq("id", listingId)
    .eq("is_approved", true)
    .maybeSingle();

  if (listingErr || !listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const kind = listingKind(listing.listing_type);
  const title = listing.og_title || listing.business_name || listing.og_site_name || "Community listing";
  const description = listing.custom_blurb || listing.og_description || null;
  const content = shareText || `Shared a ${kind}: ${title}`;

  const { data: inserted, error: insertErr } = await userClient
    .from("posts")
    .insert({
      user_id: user.id,
      post_as_user_id: postAsValidation.postAsUserId,
      wall_user_id: null,
      content,
      image_url: null,
      gif_url: null,
      og_url: listing.website_url,
      og_title: title,
      og_description: description,
      og_image: listing.og_image,
      og_site_name: listing.og_site_name || (kind === "resource" ? "Resource" : "Business Directory"),
    })
    .select("id")
    .maybeSingle();

  if (insertErr || !inserted?.id) {
    return NextResponse.json({ error: insertErr?.message || "Failed to share listing" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    postId: inserted.id,
    listingId: listing.id,
  });
}
