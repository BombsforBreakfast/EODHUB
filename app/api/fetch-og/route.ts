import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractMetadata } from "@/app/lib/metadata/extractMetadata";
import { logSecurityAuditEvent } from "@/app/lib/securityAuditServer";

export async function POST(req: NextRequest) {
  const routePath = "/api/fetch-og";
  try {
    // Require a logged-in admin — this route uses the service role key
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await logSecurityAuditEvent({
        route: routePath,
        action: "fetch_business_og",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "missing_bearer" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      await logSecurityAuditEvent({
        route: routePath,
        action: "fetch_business_og",
        outcome: "deny",
        httpStatus: 401,
        metadata: { reason: "invalid_session" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userClient.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
    if (!profile?.is_admin) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_business_og",
        outcome: "deny",
        httpStatus: 403,
        metadata: { reason: "not_admin" },
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { listingId, websiteUrl } = await req.json();

    if (!listingId || !websiteUrl) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_business_og",
        outcome: "deny",
        httpStatus: 400,
        metadata: { reason: "missing_args" },
      });
      return NextResponse.json(
        { error: "Missing listingId or websiteUrl" },
        { status: 400 }
      );
    }

    const metadata = await extractMetadata(websiteUrl);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: listing, error: listingError } = await supabase
      .from("business_listings")
      .select("id")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_business_og",
        outcome: "error",
        httpStatus: 500,
        metadata: { reason: "listing_lookup_failed", listingId, message: listingError.message },
      });
      return NextResponse.json({ error: listingError.message }, { status: 500 });
    }
    if (!listing) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_business_og",
        outcome: "deny",
        httpStatus: 404,
        metadata: { reason: "listing_not_found", listingId },
      });
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("business_listings")
      .update({
        og_title: metadata.title,
        og_description: metadata.description,
        og_image: metadata.image,
        og_site_name: metadata.siteName,
      })
      .eq("id", listingId);

    if (error) {
      await logSecurityAuditEvent({
        actorUserId: user.id,
        route: routePath,
        action: "fetch_business_og",
        outcome: "error",
        httpStatus: 500,
        metadata: { reason: "update_failed", listingId, message: error.message },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSecurityAuditEvent({
      actorUserId: user.id,
      route: routePath,
      action: "fetch_business_og",
      outcome: "allow",
      httpStatus: 200,
      metadata: { listingId },
    });

    return NextResponse.json({
      success: true,
      og_title: metadata.title,
      og_description: metadata.description,
      og_image: metadata.image,
      og_site_name: metadata.siteName,
      url: metadata.url,
    });
  } catch (error) {
    await logSecurityAuditEvent({
      route: routePath,
      action: "fetch_business_og",
      outcome: "error",
      httpStatus: 500,
      metadata: { reason: "exception", message: error instanceof Error ? error.message : "unknown" },
    });
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}