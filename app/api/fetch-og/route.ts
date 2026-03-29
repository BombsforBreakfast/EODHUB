import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractMetadata } from "@/app/lib/metadata/extractMetadata";

export async function POST(req: NextRequest) {
  try {
    // Require a logged-in admin — this route uses the service role key
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await userClient.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { listingId, websiteUrl } = await req.json();

    if (!listingId || !websiteUrl) {
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      og_title: metadata.title,
      og_description: metadata.description,
      og_image: metadata.image,
      og_site_name: metadata.siteName,
      url: metadata.url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}