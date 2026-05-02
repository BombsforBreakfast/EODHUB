import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { extractMetadata } from "@/app/lib/metadata/extractMetadata";
import { dedupeKeyFromArticleUrl } from "@/app/lib/news/dedupe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANUAL_RELEVANCE_SCORE = 50;

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { userId: authData.user.id };
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeManualUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = "";
  return u.href;
}

function hostnameOnly(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "article";
  }
}

/**
 * POST /api/admin/news/manual
 * Body: { url: string, headline?: string, summary?: string }
 *
 * Inserts `news_items` as pending with the same fields ingestion uses. Approve
 * via existing /api/admin/news — shadow post + feed behave like any RUMINT story.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { url?: string; headline?: string; summary?: string };
  try {
    body = (await req.json()) as { url?: string; headline?: string; summary?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeManualUrl(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  const dedupe_key = dedupeKeyFromArticleUrl(normalizedUrl);

  const supabase = adminClient();
  const { data: existing } = await supabase
    .from("news_items")
    .select("id, status")
    .eq("dedupe_key", dedupe_key)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        error: "This URL is already in the news queue",
        existing_id: (existing as { id: string }).id,
        existing_status: (existing as { status: string }).status,
      },
      { status: 409 }
    );
  }

  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let ogImage: string | null = null;
  let ogSiteName: string | null = null;
  let metadataError: string | null = null;

  try {
    const meta = await extractMetadata(normalizedUrl);
    ogTitle = meta.title;
    ogDescription = meta.description;
    ogImage = meta.image;
    ogSiteName = meta.siteName;
  } catch (e) {
    metadataError = (e as Error).message;
  }

  const overrideHeadline = typeof body.headline === "string" ? body.headline.trim() : "";
  const overrideSummary = typeof body.summary === "string" ? body.summary.trim() : "";

  const host = hostnameOnly(normalizedUrl);
  const headline =
    overrideHeadline ||
    ogTitle?.trim() ||
    `News article (${host})`;

  const summary =
    overrideSummary || (ogDescription?.trim() ? ogDescription.trim() : null);

  const row = {
    headline,
    source_name: ogSiteName?.trim() || host,
    source_url: normalizedUrl,
    canonical_url: normalizedUrl,
    summary,
    thumbnail_url: ogImage,
    published_at: null as string | null,
    tags: [] as string[],
    relevance_score: MANUAL_RELEVANCE_SCORE,
    dedupe_key,
    raw_payload: {
      provider: "manual_admin",
      submitted_url: rawUrl,
      normalized_url: normalizedUrl,
      metadata_error: metadataError,
      og: {
        title: ogTitle,
        description: ogDescription,
        image: ogImage,
        site_name: ogSiteName,
      },
    },
    content_type: "news",
    is_satire: false,
    status: "pending" as const,
  };

  const { data: inserted, error } = await supabase.from("news_items").insert(row).select("id").single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: (inserted as { id: string }).id,
    headline,
    metadata_fetched: !metadataError,
    metadata_error: metadataError,
  });
}
