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
    if (ct && !ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;

    const ext = extFromContentType(ct);
    const safe = keyHint.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "event";
    const path = `event-covers/eodwf-${Date.now().toString(36)}-${safe}.${ext}`;

    const { error } = await admin.storage.from("feed-images").upload(path, buf, {
      contentType: ct?.split(";")[0] || `image/${ext}`,
      upsert: false,
    });
    if (error) {
      console.warn("[eodwf] image upload failed:", error.message);
      return null;
    }
    const { data } = admin.storage.from("feed-images").getPublicUrl(path);
    return data.publicUrl || null;
  } catch (err) {
    console.warn("[eodwf] image download failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
