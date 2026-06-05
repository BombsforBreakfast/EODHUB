/** Shared upload size limits (bytes). */
export const UPLOAD_LIMITS = {
  /** Photos, avatars, covers, listing images (legacy cap before compression). */
  image: 8 * 1024 * 1024,
  /** Target size after avatar compression (onboarding, profile photo). */
  avatarImage: 512 * 1024,
  /** Target size after feed / gallery image compression. */
  feedImage: 1536 * 1024,
  /** RUMINT news link-card override images after compression. */
  newsThumbnail: 512 * 1024,
  /** Short in-app video clips (~3–4 min). */
  video: 100 * 1024 * 1024,
  /** Business organization wall posts (~6–8 min at similar quality). */
  businessVideo: 200 * 1024 * 1024,
  /** PDFs and document attachments. */
  document: 25 * 1024 * 1024,
  /** Messenger photo attachments after automatic resize/compression. */
  messageImage: 5 * 1024 * 1024,
  /** Supabase feed-images bucket hard cap (member video or pre-compress images). */
  feedBucket: 100 * 1024 * 1024,
  /** feed-images bucket cap when a business org uploads video (matches businessVideo). */
  businessFeedBucket: 200 * 1024 * 1024,
} as const;

export type FeedUploadLimits = {
  video: number;
  feedBucket: number;
  videoDurationHint: string;
};

const MEMBER_FEED_UPLOAD_LIMITS: FeedUploadLimits = {
  video: UPLOAD_LIMITS.video,
  feedBucket: UPLOAD_LIMITS.feedBucket,
  videoDurationHint: "~3–4 minutes",
};

const BUSINESS_FEED_UPLOAD_LIMITS: FeedUploadLimits = {
  video: UPLOAD_LIMITS.businessVideo,
  feedBucket: UPLOAD_LIMITS.businessFeedBucket,
  videoDurationHint: "~6–8 minutes",
};

export function feedUploadLimitsForAccount(accountType: string | null | undefined): FeedUploadLimits {
  return accountType === "business_org" ? BUSINESS_FEED_UPLOAD_LIMITS : MEMBER_FEED_UPLOAD_LIMITS;
}

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

/** iOS/Android often misreport employer docs — infer from extension before trusting file.type. */
export function inferEmployerDocumentContentType(file: File): string {
  const ext = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() : "";
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext];

  const trimmedType = file.type?.trim() ?? "";
  if (trimmedType && trimmedType !== "application/octet-stream") return trimmedType;

  if (isDocumentFile(file)) return "application/pdf";
  if (isImageFile(file)) return "image/jpeg";
  return trimmedType || "application/octet-stream";
}

const UNREADABLE_FILE_MESSAGE =
  "Could not read the selected file. If it is stored in Google Drive or another cloud app, download it to your phone first, then upload again.";

const EMPTY_FILE_MESSAGE =
  "The selected file appears empty. Try saving a copy on your phone and upload again.";

/** Read file bytes into memory before upload — fixes Android pickers that fail mid-request. */
export async function materializeUploadFile(file: File, contentType?: string): Promise<File> {
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw new Error(UNREADABLE_FILE_MESSAGE);
  }
  if (buffer.byteLength === 0) {
    throw new Error(EMPTY_FILE_MESSAGE);
  }
  const resolvedType = contentType ?? inferEmployerDocumentContentType(file);
  return new File([buffer], file.name || "document", {
    type: resolvedType,
    lastModified: file.lastModified,
  });
}

export function formatEmployerDocumentUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message === "Failed to fetch"
    || message.includes("NetworkError")
    || message.includes("Load failed")
    || message.includes("network")
  ) {
    return (
      "Upload could not reach the server. Check your connection, stay on this page while uploading, and try again. " +
      "If the file is in Google Drive or another cloud app, download it to your phone first."
    );
  }
  if (message.toLowerCase().includes("mime") || message.toLowerCase().includes("not allowed")) {
    return "That file type is not supported. Use PDF, Word (.doc/.docx), or a plain text file.";
  }
  return message;
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
  options?: { videoDurationHint?: string },
): string {
  const sizeLabel = formatUploadBytes(file.size);
  const limitLabel = formatUploadBytes(limitBytes);

  if (kind === "video") {
    const durationHint = options?.videoDurationHint ?? "~3–4 minutes";
    return (
      `"${file.name}" is too large (${sizeLabel}). Direct video uploads must be under ${limitLabel} (${durationHint}). ` +
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
export function validateFileOnPick(
  file: File,
  limits: FeedUploadLimits = MEMBER_FEED_UPLOAD_LIMITS,
): string | null {
  const kind = uploadFileKind(file);

  if (kind === "video") {
    if (file.size > limits.video) {
      return uploadTooLargeMessage(file, limits.video, "video", {
        videoDurationHint: limits.videoDurationHint,
      });
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
    if (file.size > limits.feedBucket) {
      return uploadTooLargeMessage(file, limits.feedBucket, "image");
    }
    return null;
  }

  return `"${file.name}" is not a supported file type. Use a photo, short video, or PDF.`;
}

/** Validate files for feed/profile attachment pickers; returns first error if any. */
export function validateFeedAttachmentPick(
  files: File[],
  limits: FeedUploadLimits = MEMBER_FEED_UPLOAD_LIMITS,
): string | null {
  for (const file of files) {
    const err = validateFileOnPick(file, limits);
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

/** Validate resume/education/training picks before upload starts. */
export function validateEmployerDocumentPick(file: File): string | null {
  if (isImageFile(file)) return validateImagePick(file);
  if (!isEmployerDocumentFile(file)) {
    return "Please choose a PDF, Word doc, text file, or image.";
  }
  if (file.size === 0) return EMPTY_FILE_MESSAGE;
  if (file.size > UPLOAD_LIMITS.document) {
    return uploadTooLargeMessage(file, UPLOAD_LIMITS.document, "document");
  }
  return null;
}

function isEmployerDocumentFile(file: File): boolean {
  return (
    isDocumentFile(file)
    || EMPLOYER_DOC_NAME.test(file.name)
    || file.type.startsWith("application/")
    || file.type.startsWith("text/")
  );
}

const EMPLOYER_DOC_NAME = /\.(pdf|doc|docx|txt|rtf|odt)$/i;

/** Validate a document pick (RabbitHole, scrapbook, etc.). */
export function validateDocumentPick(file: File): string | null {
  if (!isDocumentFile(file)) return "Please choose a PDF or document file.";
  if (file.size > UPLOAD_LIMITS.document) {
    return uploadTooLargeMessage(file, UPLOAD_LIMITS.document, "document");
  }
  return null;
}
