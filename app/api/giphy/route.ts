import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logGiphyApiCall, type GiphyEndpoint } from "@/app/lib/server/logGiphyApiCall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function giphyApiKey(): string | null {
  return process.env.GIPHY_API_KEY ?? process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? null;
}

export async function GET(req: NextRequest) {
  const apiKey = giphyApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "GIPHY not configured" }, { status: 503 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode");
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  let endpoint: GiphyEndpoint;
  let upstreamUrl: URL;

  if (mode === "trending") {
    endpoint = "trending";
    upstreamUrl = new URL("https://api.giphy.com/v1/gifs/trending");
    upstreamUrl.searchParams.set("api_key", apiKey);
    upstreamUrl.searchParams.set("limit", "20");
    upstreamUrl.searchParams.set("rating", "g");
  } else if (mode === "search" && q) {
    endpoint = "search";
    upstreamUrl = new URL("https://api.giphy.com/v1/gifs/search");
    upstreamUrl.searchParams.set("api_key", apiKey);
    upstreamUrl.searchParams.set("q", q);
    upstreamUrl.searchParams.set("limit", "20");
    upstreamUrl.searchParams.set("rating", "g");
  } else {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl.toString(), { next: { revalidate: 0 } });
  } catch (err) {
    console.error("[giphy] upstream fetch failed:", err);
    return NextResponse.json({ error: "GIPHY request failed" }, { status: 502 });
  }

  const payload = await upstreamRes.json().catch(() => null);
  if (!upstreamRes.ok) {
    return NextResponse.json(
      payload ?? { error: "GIPHY error" },
      { status: upstreamRes.status },
    );
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  void logGiphyApiCall(adminClient, endpoint, authData.user.id);

  return NextResponse.json(payload);
}
