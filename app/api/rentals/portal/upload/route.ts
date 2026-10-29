import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { rentalProvider, rentalFailure, rentalJson, rentalLimit, ensureSameOrigin, RentalError, checkDb } from "@/app/lib/rentals/portal.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const { db, provider } = await rentalProvider(request);
    await rentalLimit(db, request, `rental-upload:${provider.user_id}`, 150);
    if (Number(request.headers.get("content-length")) > 4200000) throw new RentalError("Compress this photo to less than 4 MB.", 413);
    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size > 4000000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new RentalError("Upload a JPG, PNG, or WebP photo under 4 MB.");
    const photo = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 30000000 }).rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 83 }).toBuffer();
    const path = `${provider.user_id}/photos/${randomUUID()}.webp`;
    checkDb((await db.storage.from("rental-assets").upload(path, photo, { contentType: "image/webp", upsert: false })).error);
    const { data, error } = await db.storage.from("rental-assets").createSignedUrl(path, 3600); checkDb(error);
    return rentalJson({ path, url: data?.signedUrl });
  } catch (error) { return rentalFailure(error); }
}
