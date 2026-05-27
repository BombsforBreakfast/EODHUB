import { compressImageFile } from "./compressImage";
import {
  UPLOAD_LIMITS,
  isDocumentFile,
  isImageFile,
  isVideoFile,
  normalizeEmployerDocumentFile,
  uploadTooLargeMessage,
  validateDocumentPick,
  validateFileOnPick,
} from "./uploadLimits";

export type PrepareUploadResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

/** Prepare a feed attachment (image, short video, or PDF) for upload. */
export async function prepareFeedUploadFile(file: File): Promise<PrepareUploadResult> {
  const pickError = validateFileOnPick(file);
  if (pickError) return { ok: false, error: pickError };

  if (isVideoFile(file)) {
    return { ok: true, file };
  }

  if (isDocumentFile(file)) {
    return { ok: true, file };
  }

  if (isImageFile(file)) {
    try {
      const compressed = await compressImageFile(file);
      return { ok: true, file: compressed };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not compress image.",
      };
    }
  }

  return { ok: false, error: `"${file.name}" is not a supported file type.` };
}

/** Prepare a standalone image upload (avatars, covers, listings). */
export async function prepareImageUploadFile(file: File): Promise<PrepareUploadResult> {
  if (!isImageFile(file)) {
    return { ok: false, error: "Please choose an image file." };
  }

  if (file.size > UPLOAD_LIMITS.feedBucket) {
    return {
      ok: false,
      error: uploadTooLargeMessage(file, UPLOAD_LIMITS.feedBucket, "image"),
    };
  }

  try {
    const compressed = await compressImageFile(file);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not compress image.",
    };
  }
}

/** Prepare a messenger photo attachment: smaller cap and dimensions for fast chat sends. */
export async function prepareMessagePhotoUploadFile(file: File): Promise<PrepareUploadResult> {
  if (!isImageFile(file)) {
    return { ok: false, error: "Please choose a photo." };
  }

  if (file.size > UPLOAD_LIMITS.feedBucket) {
    return {
      ok: false,
      error: uploadTooLargeMessage(file, UPLOAD_LIMITS.feedBucket, "image"),
    };
  }

  try {
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.messageImage, 1600);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resize photo.",
    };
  }
}

/** Prepare a JPEG blob from a crop dialog for upload. */
export async function prepareCroppedImageBlob(blob: Blob, filename: string): Promise<PrepareUploadResult> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  if (file.size <= UPLOAD_LIMITS.image) {
    return { ok: true, file };
  }
  try {
    const compressed = await compressImageFile(file);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not compress image.",
    };
  }
}

/** Prepare a document for RabbitHole / scrapbook upload. */
export function prepareDocumentUploadFile(file: File): PrepareUploadResult {
  const err = validateDocumentPick(file);
  if (err) return { ok: false, error: err };
  return { ok: true, file };
}

const EMPLOYER_DOC_NAME = /\.(pdf|doc|docx|txt|rtf|odt)$/i;

function isEmployerDocumentFile(file: File): boolean {
  return (
    isDocumentFile(file)
    || EMPLOYER_DOC_NAME.test(file.name)
    || file.type.startsWith("application/")
    || file.type.startsWith("text/")
  );
}

/** Resume, education, and training uploads on profile. */
export async function prepareEmployerDocumentUpload(file: File): Promise<PrepareUploadResult> {
  if (isImageFile(file)) {
    return prepareImageUploadFile(file);
  }
  if (!isEmployerDocumentFile(file)) {
    return { ok: false, error: "Please choose a PDF, Word doc, text file, or image." };
  }
  if (file.size > UPLOAD_LIMITS.document) {
    return {
      ok: false,
      error: uploadTooLargeMessage(file, UPLOAD_LIMITS.document, "document"),
    };
  }
  return { ok: true, file: normalizeEmployerDocumentFile(file) };
}

/** Prepare any image or document for memorial scrapbook uploads. */
export async function prepareScrapbookUploadFile(file: File): Promise<PrepareUploadResult> {
  if (isDocumentFile(file)) {
    return prepareDocumentUploadFile(file);
  }
  if (isImageFile(file)) {
    return prepareImageUploadFile(file);
  }
  return { ok: false, error: "Please choose a photo or document file." };
}
