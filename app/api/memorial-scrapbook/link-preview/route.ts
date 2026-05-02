import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractMetadata } from "@/app/lib/metadata/extractMetadata";

/** Authenticated link preview for memorial scrapbook article submissions (SSRF-safe). */
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

    const metadata = await extractMetadata(url);
    return NextResponse.json(metadata);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch preview" },
      { status: 500 },
    );
  }
}
