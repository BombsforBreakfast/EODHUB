import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentKind = "resume" | "education" | "training" | "eod_cert";

const VERIFICATION_DOCS_BUCKET = "verification-docs";
const SIGNED_URL_TTL_SEC = 60 * 10;

function parseKind(value: string | null): DocumentKind | null {
  if (value === "resume" || value === "education" || value === "training" || value === "eod_cert") {
    return value;
  }
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

function contentDispositionForRequest(req: NextRequest, filename: string): string {
  const disposition = req.nextUrl.searchParams.get("mode") === "download" ? "attachment" : "inline";
  const safeFilename = filename.replace(/["\r\n]/g, "");
  return `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

function contentTypeForFilename(filename: string, upstreamContentType: string | null): string {
  const normalized = upstreamContentType?.split(";")[0]?.trim().toLowerCase();
  if (normalized && normalized !== "application/octet-stream") return upstreamContentType!;

  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".rtf")) return "application/rtf";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".odt")) return "application/vnd.oasis.opendocument.text";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".gif")) return "image/gif";
  return upstreamContentType || "application/octet-stream";
}

function publicDocumentUrlForKind(
  profile: {
    resume_url?: string | null;
    education_url?: string | null;
    specialized_training_docs?: Record<string, string> | null;
  },
  kind: Exclude<DocumentKind, "eod_cert">,
  tag: string | null,
): string | null {
  if (kind === "resume") return profile.resume_url?.trim() || null;
  if (kind === "education") return profile.education_url?.trim() || null;
  if (!tag) return null;
  const docs = profile.specialized_training_docs ?? {};
  return docs[tag]?.trim() || docs[tag.toLowerCase()]?.trim() || null;
}

async function streamUpstreamDocument(
  req: NextRequest,
  documentUrl: string,
  filename: string,
): Promise<NextResponse> {
  let upstream: Response;
  try {
    upstream = await fetch(documentUrl, { cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "Could not fetch document." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Could not fetch document." }, { status: 502 });
  }

  const contentType = contentTypeForFilename(filename, upstream.headers.get("content-type"));
  const contentLength = upstream.headers.get("content-length");
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": contentDispositionForRequest(req, filename),
    "Cache-Control": "private, no-store",
  });
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { headers });
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
    .select(
      "resume_url,education_url,specialized_training_docs,open_to_opportunities,eod_cert_path,eod_cert_file_name",
    )
    .eq("user_id", userId)
    .maybeSingle<{
      resume_url: string | null;
      education_url: string | null;
      specialized_training_docs: Record<string, string> | null;
      open_to_opportunities: boolean | null;
      eod_cert_path: string | null;
      eod_cert_file_name: string | null;
    }>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile || profile.open_to_opportunities !== true) {
    return NextResponse.json({ error: "Document unavailable." }, { status: 404 });
  }

  if (kind === "eod_cert") {
    const path = profile.eod_cert_path?.trim();
    if (!path) return NextResponse.json({ error: "Document unavailable." }, { status: 404 });

    const filename =
      profile.eod_cert_file_name?.trim() || path.split("/").pop() || `eod-cert-${userId}`;

    const { data: signed, error: signError } = await adminClient.storage
      .from(VERIFICATION_DOCS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC);

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: signError?.message ?? "Could not create signed URL." },
        { status: 500 },
      );
    }

    if (req.nextUrl.searchParams.get("meta") === "1") {
      return NextResponse.json({ url: signed.signedUrl, filename, kind });
    }

    return streamUpstreamDocument(req, signed.signedUrl, filename);
  }

  const documentUrl = publicDocumentUrlForKind(profile, kind, tag);
  if (!documentUrl) return NextResponse.json({ error: "Document unavailable." }, { status: 404 });

  // Metadata mode: return the (public) document URL + filename so the in-app
  // viewer can embed it directly (PDF inline, Office docs via Office viewer)
  // instead of forcing a browser download prompt. Access is still gated above.
  if (req.nextUrl.searchParams.get("meta") === "1") {
    const fallbackName = `${kind}-${userId}`;
    const filename = filenameFromUrl(documentUrl, fallbackName);
    return NextResponse.json({ url: documentUrl, filename, kind });
  }

  const fallbackName = `${kind}-${userId}.pdf`;
  const filename = filenameFromUrl(documentUrl, fallbackName);
  return streamUpstreamDocument(req, documentUrl, filename);
}
