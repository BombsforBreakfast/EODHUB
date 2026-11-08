import sharp from "sharp";
import { RENTAL_PHOTO_MAX_DIMENSION } from "./photoUpload";

export const RENTAL_PHOTO_STORAGE_BYTES = 1500000;

/** Re-encode trusted pixels only: strip metadata and bound stored image size. */
export async function rentalPhotoForStorage(input: Buffer) {
  const image = sharp(input, { limitInputPixels: 30000000, animated: false });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("Unsupported photo format.");
  for (const [dimension, quality] of [[RENTAL_PHOTO_MAX_DIMENSION, 85], [RENTAL_PHOTO_MAX_DIMENSION, 75], [1800, 75], [1400, 70]]) {
    const photo = await image.clone().rotate().resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true }).webp({ quality }).toBuffer();
    if (photo.length <= RENTAL_PHOTO_STORAGE_BYTES) return photo;
  }
  throw new Error("Photo could not be optimized.");
}
