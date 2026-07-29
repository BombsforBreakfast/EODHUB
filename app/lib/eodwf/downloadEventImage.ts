import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function extFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "jpg";
}

function sniffImageExt(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  if (
    buf.length >= 6 &&
    (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")
  ) {
    return "gif";
  }
  return null;
}

/**
 * Download a remote flyer into feed-images/event-covers and return the public URL.
 * Returns null on any failure (import continues without cover).
 */
export async function downloadEventImage(
  admin: SupabaseClient,
  remoteUrl: string,
  keyHint: string,
): Promise<string | null> {
  try {
    const res = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EODHub/1.0; +https://www.eod-hub.com)",
        Accept: "image/*,*/*",
      },
      signal: AbortSignal.timeout(25000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type");
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

    const sniffed = sniffImageExt(buf);
    if (ct && !ct.startsWith("image/") && !sniffed) return null;
    if (!ct?.startsWith("image/") && !sniffed) return null;

    const ext = sniffed || extFromContentType(ct);
    const safe = keyHint.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "event";
    const path = `event-covers/eodwf-${Date.now().toString(36)}-${safe}.${ext}`;

    const { error } = await admin.storage.from("feed-images").upload(path, buf, {
      contentType: ct?.startsWith("image/")
        ? ct.split(";")[0]
        : `image/${ext === "jpg" ? "jpeg" : ext}`,
      upsert: false,
    });
    if (error) {
      console.warn("[eodwf] image upload failed:", error.message);
      return null;
    }
    const { data } = admin.storage.from("feed-images").getPublicUrl(path);
    return data.publicUrl || null;
  } catch (err) {
    console.warn("[eodwf] image download failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
