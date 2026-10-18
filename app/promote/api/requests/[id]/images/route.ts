import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import sharp from "sharp";
import { PROMOTION_IMAGE_LIMIT } from "@/app/lib/promotions";
import { promotionAccess, promotionDb, promotionJson, readLimitedBody, PROMOTION_BUCKET } from "@/app/lib/server/promotionRequests";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = promotionAccess(request);
  if (access.error) return access.error;
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) return promotionJson({ error: "Invalid request." }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(request.headers.get("content-type") ?? "")) return promotionJson({ error: "Choose a JPG, PNG or WebP image." }, 400);
  const db = promotionDb();
  const { data: draft } = await db.from("promotion_requests").select("id, attachments").eq("id", id).eq("access_hash", access.owner).eq("status", "draft").gt("created_at", new Date(Date.now() - 86400000).toISOString()).maybeSingle();
  if (!draft) return promotionJson({ error: "This draft is no longer available. Please start your request again." }, 404);
  try {
    const bytes = await readLimitedBody(request, PROMOTION_IMAGE_LIMIT);
    const image = sharp(bytes, { limitInputPixels: 40000000, animated: false });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) throw new Error("Choose a still JPG, PNG or WebP image.");
    const normalized = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    if (normalized.length > PROMOTION_IMAGE_LIMIT) throw new Error("Please use a smaller image (up to 3 MB).");
    const uploadId = request.headers.get("x-upload-id");
    if (!uploadId || !/^[a-f0-9-]{36}$/i.test(uploadId)) throw new Error("Please choose the image again.");
    const path = `${id}/${uploadId}.webp`;
    const previous = (draft.attachments as Array<{ path: string }>).find(a => a.path === path);
    if (previous) return promotionJson({ ok: true, path });
    const { error: uploadError } = await db.storage.from(PROMOTION_BUCKET).upload(path, normalized, { contentType: "image/webp", upsert: false });
    // An earlier attempt may have uploaded before its response was lost. The
    // random per-file ID is stable on retry, and only this draft can attach it.
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw new Error("The image could not be uploaded. Please try again.");
    const name = (request.headers.get("x-file-name") ?? `image-${randomUUID().slice(0,8)}`).slice(0,140).replace(/[^a-zA-Z0-9 ._()-]/g, "_");
    const { error: attachError } = await db.rpc("attach_promotion_image", { p_id: id, p_owner: access.owner, p_file: { path, name, size: normalized.length } });
    if (attachError) { await db.storage.from(PROMOTION_BUCKET).remove([path]); throw new Error("You can attach up to five images to an open request."); }
    return promotionJson({ ok: true, path });
  } catch (e) { return promotionJson({ error: e instanceof Error && !e.message.includes("Input") ? e.message : "That image could not be read. Choose a JPG, PNG or WebP up to 3 MB." }, 400); }
}
