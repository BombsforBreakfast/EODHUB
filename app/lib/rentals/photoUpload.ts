// Originals stay in the browser. Optimized uploads leave room for multipart
// overhead below Vercel's 4.5 MB request limit.
export const RENTAL_PHOTO_ORIGINAL_BYTES = 20 * 1024 * 1024;
export const RENTAL_PHOTO_UPLOAD_BYTES = 3500000;
export const RENTAL_PHOTO_MAX_DIMENSION = 2400;
export const rentalPhotoTypes = ["image/jpeg", "image/png", "image/webp"];

export function validateRentalPhoto(file: Pick<File, "name" | "size" | "type">) {
  if (!file.size) throw new Error(`“${file.name}” is empty. Choose another photo.`);
  if (file.size > RENTAL_PHOTO_ORIGINAL_BYTES) throw new Error(`“${file.name}” is over 20 MB. Choose a smaller original.`);
  if (!rentalPhotoTypes.includes(file.type) && !(file.type === "" && /\.(jpe?g|png|webp)$/i.test(file.name))) {
    throw new Error(`“${file.name}”: choose a JPG, PNG, or WebP photo. Export HEIC photos as JPG first.`);
  }
}

/** JPEG canvas export works in Safari as well as Chromium; never mislabel a PNG fallback as WebP. */
export async function prepareRentalPhoto(file: File): Promise<File> {
  validateRentalPhoto(file);
  const url = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not open “${file.name}”. Try exporting it as a new JPG.`));
      img.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 60000000) {
      throw new Error(`“${file.name}” has unsupported dimensions. Export a smaller JPG and try again.`);
    }
    const scale = Math.min(1, RENTAL_PHOTO_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare photos. Try another browser or device.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.82, 0.74, 0.66]) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(
        value => value ? resolve(value) : reject(new Error(`Could not prepare “${file.name}”. Try a different JPG.`)), "image/jpeg", quality,
      ));
      if (blob.type !== "image/jpeg") throw new Error("This browser could not prepare a JPG. Try another browser or device.");
      if (blob.size && blob.size <= RENTAL_PHOTO_UPLOAD_BYTES) {
        return new File([blob], "property.jpg", { type: blob.type });
      }
    }
    throw new Error(`“${file.name}” could not be reduced enough to upload. Export a smaller JPG and try again.`);
  } catch (error) {
    if (error instanceof Error && error.name === "Error") throw error;
    throw new Error(`Could not prepare “${file.name}”. Try exporting it as a new JPG, or use another browser.`);
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
