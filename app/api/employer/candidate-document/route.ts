import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentKind = "resume" | "education" | "training";

function parseKind(value: string | null): DocumentKind | null {
  if (value === "resume" || value === "education" || value === "training") return value;
  return null;
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
    const clean = last.replace(/[^\w.\- ]+/g, "-").trim();
    return clean || fallback;
  } catch {
    return fallback;
  }
}

function documentUrlForKind(
  profile: {
    resume_url?: string | null;
    education_url?: string | null;
    specialized_training_docs?: Record<string, string> | null;
  },
  kind: DocumentKind,
  tag: string | null,
): string | null {
  if (kind === "resume") return profile.resume_url?.trim() || null;
  if (kind === "education") return profile.education_url?.trim() || null;
  if (!tag) return null;
  const docs = profile.specialized_training_docs ?? {};
  return docs[tag]?.trim() || docs[tag.toLowerCase()]?.trim() || null;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const kind = parseKind(req.nextUrl.searchParams.get("kind"));
  const tag = req.nextUrl.searchParams.get("tag");

  if (!userId || !kind) {
    return NextResponse.json({ error: "Missing document request." }, { status: 400 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: viewer } = await supabase
    .from("profiles")
    .select("account_type,is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (viewer?.account_type !== "employer" && !viewer?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("resume_url,education_url,specialized_training_docs,open_to_opportunities")
    .eq("user_id", userId)
    .maybeSingle<{
      resume_url: string | null;
      education_url: string | null;
      specialized_training_docs: Record<string, string> | null;
      open_to_opportunities: boolean | null;
    }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile || profile.open_to_opportunities !== true) {
    return NextResponse.json({ error: "Document unavailable." }, { status: 404 });
  }

  const documentUrl = documentUrlForKind(profile, kind, tag);
  if (!documentUrl) return NextResponse.json({ error: "Document unavailable." }, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(documentUrl, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not fetch document." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch document." }, { status: 502 });
  }

  const fallbackName = `${kind}-${userId}.pdf`;
  const filename = filenameFromUrl(documentUrl, fallbackName);
  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store",
  });
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { headers });
}
