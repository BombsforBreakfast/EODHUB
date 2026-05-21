import { UPLOAD_LIMITS, uploadTooLargeMessage } from "../../lib/uploadLimits";

/** Allowed screenshot MIME types for beta bug reports */
export const BUG_REPORT_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateBugReportImage(file: File): string | null {
  if (file.size > UPLOAD_LIMITS.image) {
    return uploadTooLargeMessage(file, UPLOAD_LIMITS.image, "image");
  }
  const nameOk = /\.(png|jpe?g|webp)$/i.test(file.name);
  const mimeOk = file.type === "" || ALLOWED_MIME.has(file.type);
  if (!nameOk && !mimeOk) {
    return "Use PNG, JPG, JPEG, or WebP only.";
  }
  if (file.type !== "" && !ALLOWED_MIME.has(file.type)) {
    return "Use PNG, JPG, JPEG, or WebP only.";
  }
  return null;
}

export function bugReportImageExtension(file: File): string {
  const n = file.name.toLowerCase();
  if (n.endsWith(".png")) return "png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (n.endsWith(".webp")) return "webp";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
