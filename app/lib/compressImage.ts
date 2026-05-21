import { UPLOAD_LIMITS, formatUploadBytes, imageStillTooLargeAfterCompressMessage } from "./uploadLimits";

const DEFAULT_MAX_DIMENSION = 2048;
const MIN_QUALITY = 0.55;
const QUALITY_STEP = 0.08;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => reject(new Error("Could not read image.")));
    img.src = src;
  });
}

function scaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxDimension) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxDimension / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to compress image."))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToFile(blob: Blob, original: File): File {
  const baseName = original.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

/**
 * Resize and re-encode photos to fit under maxBytes.
 * GIFs are returned as-is when already small enough; otherwise an error is thrown.
 */
export async function compressImageFile(
  file: File,
  maxBytes: number = UPLOAD_LIMITS.image,
  maxDimension: number = DEFAULT_MAX_DIMENSION,
): Promise<File> {
  if (file.size <= maxBytes && file.type === "image/jpeg") {
    return file;
  }

  if (file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif")) {
    if (file.size <= maxBytes) return file;
    throw new Error(
      `"${file.name}" is too large (${formatUploadBytes(file.size)}). Animated GIFs must be under ${formatUploadBytes(maxBytes)}.`,
    );
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const needsResize =
      Math.max(image.naturalWidth, image.naturalHeight) > maxDimension;
    if (file.size <= maxBytes && !needsResize && file.type === "image/jpeg") {
      return file;
    }

    const { width, height } = scaledDimensions(image.naturalWidth, image.naturalHeight, maxDimension);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image compression is not supported in this browser.");

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.88;
    let blob = await canvasToBlob(canvas, quality);

    while (blob.size > maxBytes && quality > MIN_QUALITY) {
      quality -= QUALITY_STEP;
      blob = await canvasToBlob(canvas, quality);
    }

    if (blob.size > maxBytes) {
      throw new Error(imageStillTooLargeAfterCompressMessage(file));
    }

    return blobToFile(blob, file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
