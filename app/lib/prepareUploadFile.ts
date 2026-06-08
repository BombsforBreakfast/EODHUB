import { compressImageFile } from "./compressImage";
import {
  UPLOAD_LIMITS,
  feedUploadLimitsForAccount,
  inferEmployerDocumentContentType,
  isDocumentFile,
  isImageFile,
  isVideoFile,
  materializeUploadFile,
  uploadTooLargeMessage,
  validateDocumentPick,
  validateEmployerDocumentPick,
  validateFileOnPick,
} from "./uploadLimits";

export type PrepareUploadResult =
  | { ok: true; file: File }
  | { ok: false; error: string };

/** Prepare a feed attachment (image, short video, or PDF) for upload. */
export async function prepareFeedUploadFile(
  file: File,
  options?: { accountType?: string | null },
): Promise<PrepareUploadResult> {
  const limits = feedUploadLimitsForAccount(options?.accountType);
  const pickError = validateFileOnPick(file, limits);
  if (pickError) return { ok: false, error: pickError };

  if (isVideoFile(file)) {
    return { ok: true, file };
  }

  if (isDocumentFile(file)) {
    return { ok: true, file };
  }

  if (isImageFile(file)) {
    try {
      const compressed = await compressImageFile(file, UPLOAD_LIMITS.feedImage, 1600);
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
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.feedImage, 1600);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not compress image.",
    };
  }
}

/** Business logos — stored once at a display-safe size without runtime transforms. */
export async function prepareLogoUploadFile(file: File): Promise<PrepareUploadResult> {
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
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.feedImage, 1200);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resize image.",
    };
  }
}

/** Feed/list preview image — stored once at a display-safe size without runtime transforms. */
export async function prepareFeedThumbnailUploadFile(file: File): Promise<PrepareUploadResult> {
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
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.feedImage, 1200);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not resize image.",
    };
  }
}

/** RUMINT news manual photo override — smaller cap for link-preview cards. */
export async function prepareNewsThumbnailUploadFile(file: File): Promise<PrepareUploadResult> {
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
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.newsThumbnail, 1200);
    return { ok: true, file: compressed };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not compress image.",
    };
  }
}

/** Profile avatars — smaller dimensions and byte cap to limit storage egress. */
export async function prepareAvatarUploadFile(file: File): Promise<PrepareUploadResult> {
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
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.avatarImage, 800);
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
  const isAvatar = /avatar/i.test(filename);
  if (isAvatar) {
    return prepareAvatarUploadFile(file);
  }
  if (file.size <= UPLOAD_LIMITS.feedImage) {
    return { ok: true, file };
  }
  try {
    const compressed = await compressImageFile(file, UPLOAD_LIMITS.feedImage, 1600);
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

/** Resume, education, and training uploads on profile. */
export async function prepareEmployerDocumentUpload(file: File): Promise<PrepareUploadResult> {
  const pickError = validateEmployerDocumentPick(file);
  if (pickError) return { ok: false, error: pickError };

  if (isImageFile(file)) {
    return prepareImageUploadFile(file);
  }

  try {
    const contentType = inferEmployerDocumentContentType(file);
    const materialized = await materializeUploadFile(file, contentType);
    if (materialized.size > UPLOAD_LIMITS.document) {
      return {
        ok: false,
        error: uploadTooLargeMessage(materialized, UPLOAD_LIMITS.document, "document"),
      };
    }
    return { ok: true, file: materialized };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not read the selected file.",
    };
  }
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
