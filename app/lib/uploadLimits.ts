/** Shared upload size limits (bytes). */
export const UPLOAD_LIMITS = {
  /** Photos, avatars, covers, listing images. */
  image: 8 * 1024 * 1024,
  /** Short in-app video clips (~3–4 min). */
  video: 100 * 1024 * 1024,
  /** PDFs and document attachments. */
  document: 25 * 1024 * 1024,
  /** Messenger photo attachments after automatic resize/compression. */
  messageImage: 5 * 1024 * 1024,
  /** Supabase feed-images bucket hard cap (video or pre-compress images). */
  feedBucket: 100 * 1024 * 1024,
} as const;

export type UploadFileKind = "video" | "image" | "document" | "other";

export function formatUploadBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|avi)$/i.test(file.name);
}

export function isDocumentFile(file: File): boolean {
  return (
    file.type === "application/pdf"
    || /\.pdf$/i.test(file.name)
  );
}

/** File input accept string for profile resume/education/training pickers (MIME first for iOS). */
export const EMPLOYER_DOCUMENT_ACCEPT =
  "application/pdf,.pdf,application/msword,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/plain,.txt,application/rtf,.rtf,application/vnd.oasis.opendocument.text,.odt,image/*";

/** Feed, wall, and group post attachment pickers (MIME first for iOS). */
export const FEED_ATTACHMENT_ACCEPT =
  "image/*,video/*,.pdf,application/pdf,.mp4,.mov,.webm,.m4v";

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi|mkv|ogv)(\?|$)/i.test(url);
}

const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

/** iOS often sends PDFs as application/octet-stream or an empty type — infer before storage upload. */
export function inferEmployerDocumentContentType(file: File): string {
  const trimmedType = file.type?.trim() ?? "";
  if (trimmedType && trimmedType !== "application/octet-stream") return trimmedType;

  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];
  if (isDocumentFile(file)) return "application/pdf";
  if (isImageFile(file)) return "image/jpeg";
  return trimmedType || "application/octet-stream";
}

export function normalizeEmployerDocumentFile(file: File): File {
  const contentType = inferEmployerDocumentContentType(file);
  if (file.type === contentType) return file;
  return new File([file], file.name || "document", {
    type: contentType,
    lastModified: file.lastModified,
  });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name);
}

export function uploadFileKind(file: File): UploadFileKind {
  if (isVideoFile(file)) return "video";
  if (isDocumentFile(file)) return "document";
  if (isImageFile(file)) return "image";
  return "other";
}

export function uploadTooLargeMessage(
  file: File,
  limitBytes: number,
  kind: "video" | "image" | "document",
): string {
  const sizeLabel = formatUploadBytes(file.size);
  const limitLabel = formatUploadBytes(limitBytes);

  if (kind === "video") {
    return (
      `"${file.name}" is too large (${sizeLabel}). Direct video uploads must be under ${limitLabel} (~3–4 minutes). ` +
      "For longer or higher-quality video, paste a YouTube or Vimeo link in your post instead."
    );
  }

  if (kind === "document") {
    return `"${file.name}" is too large (${sizeLabel}). Documents must be under ${limitLabel}.`;
  }

  return (
    `"${file.name}" is too large (${sizeLabel}). Photos must be under ${limitLabel}. ` +
    "Try exporting a smaller version from your phone."
  );
}

export function imageStillTooLargeAfterCompressMessage(file: File): string {
  return (
    `"${file.name}" is still too large (${formatUploadBytes(file.size)}) after compressing. ` +
    `Photos must be under ${formatUploadBytes(UPLOAD_LIMITS.image)}. Try a smaller export from your phone.`
  );
}

/** Sync validation when the user picks a file (before upload / compression). */
export function validateFileOnPick(file: File): string | null {
  const kind = uploadFileKind(file);

  if (kind === "video") {
    if (file.size > UPLOAD_LIMITS.video) {
      return uploadTooLargeMessage(file, UPLOAD_LIMITS.video, "video");
    }
    return null;
  }

  if (kind === "document") {
    if (file.size > UPLOAD_LIMITS.document) {
      return uploadTooLargeMessage(file, UPLOAD_LIMITS.document, "document");
    }
    return null;
  }

  if (kind === "image") {
    if (file.size > UPLOAD_LIMITS.feedBucket) {
      return uploadTooLargeMessage(file, UPLOAD_LIMITS.feedBucket, "image");
    }
    return null;
  }

  return `"${file.name}" is not a supported file type. Use a photo, short video, or PDF.`;
}

/** Validate files for feed/profile attachment pickers; returns first error if any. */
export function validateFeedAttachmentPick(files: File[]): string | null {
  for (const file of files) {
    const err = validateFileOnPick(file);
    if (err) return err;
  }
  return null;
}

/** Validate a profile/avatar/cover image pick (before crop). */
export function validateImagePick(file: File): string | null {
  if (!isImageFile(file)) return "Please choose an image file.";
  if (file.size > UPLOAD_LIMITS.feedBucket) {
    return uploadTooLargeMessage(file, UPLOAD_LIMITS.feedBucket, "image");
  }
  return null;
}

/** Validate a document pick (RabbitHole, scrapbook, etc.). */
export function validateDocumentPick(file: File): string | null {
  if (!isDocumentFile(file)) return "Please choose a PDF or document file.";
  if (file.size > UPLOAD_LIMITS.document) {
    return uploadTooLargeMessage(file, UPLOAD_LIMITS.document, "document");
  }
  return null;
}
