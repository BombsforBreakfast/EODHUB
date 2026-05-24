import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkUrlEmbeddable } from "@/app/lib/metadata/extractMetadata";

/** Check whether a scrapbook article URL allows iframe embedding (SSRF-safe). */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const url = typeof body?.url === "string" ? body.url : "";
    if (!url.trim()) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const result = await checkUrlEmbeddable(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to check embed" },
      { status: 500 },
    );
  }
}
