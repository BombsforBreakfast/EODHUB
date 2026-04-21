import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://eod-wf.org";
const API = `${BASE}/wp-json/wp/v2`;

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#038;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

async function wpFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function POST(req: NextRequest) {
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
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Step 1: Get the category ID for "virtual-memorial"
  let categoryId: number;
  try {
    const cats = await wpFetch(`${API}/categories?slug=virtual-memorial&_fields=id`);
    if (!Array.isArray(cats) || cats.length === 0) {
      return NextResponse.json({ error: "Could not find virtual-memorial category via WordPress REST API" }, { status: 502 });
    }
    categoryId = cats[0].id;
  } catch (err) {
    return NextResponse.json({
      error: `WordPress REST API unavailable: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 502 });
  }

  // Step 2: Paginate all posts in that category
  type WpPost = { id: number; title: { rendered: string }; date: string; link: string };
  const allPosts: WpPost[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 30) {
    try {
      const posts: WpPost[] = await wpFetch(
        `${API}/posts?categories=${categoryId}&per_page=100&page=${page}&_fields=id,title,date,link&orderby=date&order=asc`
      );
      if (!Array.isArray(posts) || posts.length === 0) {
        hasMore = false;
      } else {
        allPosts.push(...posts);
        hasMore = posts.length === 100;
        page++;
      }
    } catch {
      hasMore = false;
    }
  }

  if (allPosts.length === 0) {
    return NextResponse.json({
      error: "WordPress REST API returned no posts — the API may be disabled or category ID changed",
    }, { status: 502 });
  }

  // Step 3: Build rows, skip already-imported in one bulk check
  const errors: string[] = [];

  type MemorialRow = { user_id: string; name: string; death_date: string; source_url: string; bio: null; photo_url: null };
  const rows: MemorialRow[] = [];

  for (const post of allPosts) {
    const source_url = post.link.endsWith("/") ? post.link : `${post.link}/`;
    const name = decodeHtmlEntities(post.title.rendered).trim();
    const death_date = post.date.slice(0, 10); // "2024-05-11T..." → "2024-05-11"
    if (!name || !death_date) {
      errors.push(`Missing name or date for post ${post.id}`);
      continue;
    }
    rows.push({ user_id: user.id, name, death_date, source_url, bio: null, photo_url: null });
  }

  // One query to find all already-imported source_urls
  const allUrls = rows.map((r) => r.source_url);
  const { data: existing } = await adminClient
    .from("memorials")
    .select("source_url")
    .in("source_url", allUrls);
  const existingUrls = new Set((existing ?? []).map((r: { source_url: string }) => r.source_url));

  const newRows = rows.filter((r) => !existingUrls.has(r.source_url));
  const skipped = rows.length - newRows.length;

  // Batch insert in chunks of 100 to stay well within limits
  let imported = 0;
  const CHUNK = 100;
  for (let i = 0; i < newRows.length; i += CHUNK) {
    const chunk = newRows.slice(i, i + CHUNK);
    const { error } = await adminClient.from("memorials").insert(chunk);
    if (error) {
      errors.push(`Batch insert error (rows ${i}–${i + chunk.length}): ${error.message}`);
    } else {
      imported += chunk.length;
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: allPosts.length,
    errors: errors.slice(0, 20),
  });
}
