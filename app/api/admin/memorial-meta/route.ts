import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function extractOgTag(html: string, property: string): string | null {
  const a = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"));
  if (a) return a[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"));
  return b ? b[1] : null;
}

function extractBio(html: string): string | null {
  // Pull all <p> text, strip tags, skip the date paragraph and short/empty ones
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paras: string[] = [];
  let m;
  while ((m = paraRe.exec(html)) !== null) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (!text || text.length < 30) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) continue; // skip date-only paragraphs
    paras.push(text);
  }
  if (paras.length === 0) return null;
  return paras.slice(0, 3).join("\n\n");
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
  const { data: profile } = await userClient.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const rawTitle = extractOgTag(html, "og:title") ?? "";
    const title = rawTitle.replace(/\s*\|\s*EOD Warrior Foundation\s*$/i, "").trim() || null;
    const description = extractOgTag(html, "og:description");
    const image = extractOgTag(html, "og:image");
    const bio = extractBio(html);

    return NextResponse.json({ title, description, image, bio });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fetch failed" }, { status: 502 });
  }
}
