import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function parseDeathDate(raw: string): string | null {
  // Handles "M/D/YYYY" or "MM/DD/YYYY"
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://eodhub.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractOgTag(html: string, property: string): string | null {
  const a = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"));
  return b ? b[1] : null;
}

function extractMemorialUrls(html: string, base: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const absRe = /href="(https:\/\/eod-wf\.org\/virtual-memorial\/[^/"]+\/[^/"]+\/)"/gi;
  const relRe = /href="(\/virtual-memorial\/[^/"]+\/[^/"]+\/)"/gi;
  let m;

  while ((m = absRe.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); urls.push(m[1]); }
  }
  while ((m = relRe.exec(html)) !== null) {
    const url = `${base}${m[1]}`;
    if (!seen.has(url)) { seen.add(url); urls.push(url); }
  }
  return urls;
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

  const BASE = "https://eod-wf.org";
  const CATEGORY = `${BASE}/category/virtual-memorial`;
  const allPostUrls = new Set<string>();

  // Paginate the main category listing — all branches roll up here
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 30) {
    const url = page === 1 ? `${CATEGORY}/` : `${CATEGORY}/page/${page}/`;
    try {
      const html = await fetchHtml(url);
      const found = extractMemorialUrls(html, BASE);
      found.forEach((u) => allPostUrls.add(u));
      hasNext = html.includes(`/page/${page + 1}/`);
    } catch {
      hasNext = false;
    }
    page++;
  }

  if (allPostUrls.size === 0) {
    return NextResponse.json(
      { error: "No memorial URLs found — the site may be blocking server-side requests. Try running from a browser context." },
      { status: 502 }
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const postUrl of allPostUrls) {
    try {
      // Skip if already imported by source_url
      const { data: existing } = await adminClient
        .from("memorials")
        .select("id")
        .eq("source_url", postUrl)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const html = await fetchHtml(postUrl);
      const ogTitle = extractOgTag(html, "og:title");
      const ogDesc = extractOgTag(html, "og:description");

      if (!ogTitle) { errors.push(`No og:title at ${postUrl}`); continue; }

      const name = ogTitle.replace(/\s*\|\s*EOD Warrior Foundation\s*$/i, "").trim();
      const death_date = ogDesc ? parseDeathDate(ogDesc) : null;

      if (!death_date) {
        errors.push(`Unparseable date "${ogDesc}" at ${postUrl}`);
        continue;
      }

      const { error } = await adminClient.from("memorials").insert([{
        user_id: user.id,
        name,
        death_date,
        source_url: postUrl,
        bio: null,
        photo_url: null,
      }]);

      if (error) {
        errors.push(`DB error for ${name}: ${error.message}`);
      } else {
        imported++;
      }

      // Be polite to eod-wf.org
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      errors.push(`Fetch error at ${postUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ success: true, imported, skipped, total: allPostUrls.size, errors: errors.slice(0, 20) });
}
