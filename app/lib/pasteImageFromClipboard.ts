import type { ClipboardEvent } from "react";
import { isImageFile } from "./uploadLimits";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

function normalizePastedFile(file: File): File {
  const trimmedName = file.name?.trim() ?? "";
  if (trimmedName && trimmedName !== "image.png" && trimmedName !== "blob") {
    return file;
  }

  const ext = EXT_BY_MIME[file.type] ?? (isImageFile(file) ? "png" : "bin");
  const name = `pasted-${Date.now()}.${ext}`;
  return new File([file], name, {
    type: file.type || "image/png",
    lastModified: file.lastModified || Date.now(),
  });
}

export type PasteImageOptions = {
  /** Ignore non-image clipboard files (e.g. sidebar messages). Default false. */
  imagesOnly?: boolean;
};

export function getClipboardImageFiles(
  data: DataTransfer | null | undefined,
  options?: PasteImageOptions,
): File[] {
  if (!data) return [];

  const files: File[] = [];
  const seen = new Set<File>();

  const acceptFile = (file: File | null) => {
    if (!file || seen.has(file)) return;
    if (options?.imagesOnly) {
      if (!file.type.startsWith("image/") && !isImageFile(file)) return;
    } else if (
      !file.type.startsWith("image/")
      && !file.type.startsWith("video/")
      && file.type !== "application/pdf"
      && !isImageFile(file)
    ) {
      return;
    }
    seen.add(file);
    files.push(normalizePastedFile(file));
  };

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    acceptFile(item.getAsFile());
  }

  if (files.length === 0) {
    for (const file of Array.from(data.files ?? [])) {
      acceptFile(file);
    }
  }

  return files;
}

/** Returns true when an image was consumed from the clipboard. */
export function handlePasteImageFromClipboard(
  e: ClipboardEvent,
  onFiles: (files: File[]) => void,
  options?: PasteImageOptions,
): boolean {
  const files = getClipboardImageFiles(e.clipboardData, options);
  if (files.length === 0) return false;
  e.preventDefault();
  onFiles(files);
  return true;
}
