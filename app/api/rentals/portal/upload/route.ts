import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { RENTAL_PHOTO_UPLOAD_BYTES, rentalPhotoTypes } from "@/app/lib/rentals/photoUpload";
import { rentalPhotoForStorage } from "@/app/lib/rentals/photoStorage";
import { rentalProvider, rentalFailure, rentalJson, rentalLimit, ensureSameOrigin, RentalError, checkDb } from "@/app/lib/rentals/portal.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const { db, provider } = await rentalProvider(request);
    await rentalLimit(db, request, `rental-upload:${provider.user_id}`, 150);
    if (Number(request.headers.get("content-length")) > RENTAL_PHOTO_UPLOAD_BYTES + 100000) throw new RentalError("Choose this photo again so the portal can resize it before uploading.", 413);
    let form: FormData;
    try { form = await request.formData(); } catch { throw new RentalError("This photo upload was incomplete. Choose the photo and try again."); }
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > RENTAL_PHOTO_UPLOAD_BYTES || !rentalPhotoTypes.includes(file.type)) throw new RentalError("Choose a JPG, PNG, or WebP photo in the portal so it can be resized automatically.");
    let photo: Buffer;
    try {
      photo = await rentalPhotoForStorage(Buffer.from(await file.arrayBuffer()));
    } catch { throw new RentalError("This photo could not be read. Export it as a new JPG and try again."); }
    const path = `${provider.user_id}/photos/${randomUUID()}.webp`;
    checkDb((await db.storage.from("rental-assets").upload(path, photo, { contentType: "image/webp", upsert: false })).error);
    const { data, error } = await db.storage.from("rental-assets").createSignedUrl(path, 3600); checkDb(error);
    return rentalJson({ path, url: data?.signedUrl });
  } catch (error) { return rentalFailure(error); }
}
