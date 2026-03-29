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

  // Step 3: Insert into memorials table
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const post of allPosts) {
    try {
      const source_url = post.link.endsWith("/") ? post.link : `${post.link}/`;

      // Skip if already imported
      const { data: existing } = await adminClient
        .from("memorials")
        .select("id")
        .eq("source_url", source_url)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const name = decodeHtmlEntities(post.title.rendered).trim();
      // WordPress date is ISO: "2024-05-11T00:00:00" — take first 10 chars
      const death_date = post.date.slice(0, 10);

      if (!name || !death_date) {
        errors.push(`Missing name or date for post ${post.id}`);
        continue;
      }

      const { error } = await adminClient.from("memorials").insert([{
        user_id: user.id,
        name,
        death_date,
        source_url,
        bio: null,
        photo_url: null,
      }]);

      if (error) {
        errors.push(`DB error for "${name}": ${error.message}`);
      } else {
        imported++;
      }
    } catch (err) {
      errors.push(`Error on post ${post.id}: ${err instanceof Error ? err.message : String(err)}`);
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
