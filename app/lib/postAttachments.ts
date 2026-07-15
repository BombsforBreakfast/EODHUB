import {
  attachmentRenderKindFromUrl,
  isCad3dUrl,
} from "./uploadLimits";
import { muxPosterUrl, parseMuxFeedVideoUrl, type FeedVideoStatus } from "./feedVideoUrl";

export type PostAttachmentKind = "image" | "video" | "pdf" | "cad3d" | "other";

export type PostAttachment = {
  kind: PostAttachmentKind;
  /** Primary file URL for this attachment (original file for CAD). */
  url: string;
  /** Render URL (preview image for CAD; original URL for other kinds). */
  renderUrl: string;
  fileName: string;
  cadToken?: string;
  muxVideoId?: string;
  muxPlaybackId?: string | null;
  muxStatus?: FeedVideoStatus;
  posterUrl?: string;
};

export const CAD_PREVIEW_PREFIX = "cadpreview-";
export const CAD_FILE_PREFIX = "cadfile-";

export function fileNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const raw = decodeURIComponent(pathname.split("/").pop() ?? "");
    return raw || "file";
  } catch {
    const clean = url.split("?")[0]?.split("#")[0] ?? "";
    const raw = decodeURIComponent(clean.split("/").pop() ?? "");
    return raw || "file";
  }
}

export function createCadAttachmentToken(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}${random}`;
}

function cleanName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

export function buildCadStorageFileName(
  token: string,
  role: "preview" | "file",
  originalName: string,
): string {
  const safe = cleanName(originalName || "file");
  const prefix = role === "preview" ? CAD_PREVIEW_PREFIX : CAD_FILE_PREFIX;
  return `${prefix}${token}-${safe}`;
}

export function cadTokenFromFileName(name: string): string | null {
  const base = cleanName(name);
  if (base.startsWith(CAD_PREVIEW_PREFIX)) {
    const rest = base.slice(CAD_PREVIEW_PREFIX.length);
    const token = rest.split("-")[0] ?? "";
    return token || null;
  }
  if (base.startsWith(CAD_FILE_PREFIX)) {
    const rest = base.slice(CAD_FILE_PREFIX.length);
    const token = rest.split("-")[0] ?? "";
    return token || null;
  }
  return null;
}

export function attachmentsFromUrls(urls: string[]): PostAttachment[] {
  const orderedUrls = urls.filter(Boolean);
  const cadFilesByToken = new Map<string, { url: string; fileName: string }>();
  const cadPreviewsByToken = new Map<string, { url: string; fileName: string }>();
  const attachments: PostAttachment[] = [];

  for (const url of orderedUrls) {
    const fileName = fileNameFromUrl(url);
    const token = cadTokenFromFileName(fileName);
    const kind = attachmentRenderKindFromUrl(url);
    const muxVideo = parseMuxFeedVideoUrl(url);

    if (muxVideo) {
      attachments.push({
        kind: "video",
        url,
        renderUrl: url,
        fileName: "video",
        muxVideoId: muxVideo.id,
        muxPlaybackId: muxVideo.playbackId,
        muxStatus: muxVideo.status,
        posterUrl: muxVideo.playbackId ? muxPosterUrl(muxVideo.playbackId) : undefined,
      });
      continue;
    }

    if (token && fileName.startsWith(CAD_PREVIEW_PREFIX)) {
      cadPreviewsByToken.set(token, { url, fileName });
      continue;
    }

    if ((token && fileName.startsWith(CAD_FILE_PREFIX)) || isCad3dUrl(url)) {
      cadFilesByToken.set(token ?? url, { url, fileName });
      continue;
    }

    attachments.push({
      kind: kind === "pdf" ? "pdf" : kind === "video" ? "video" : kind === "image" ? "image" : "other",
      url,
      renderUrl: url,
      fileName,
    });
  }

  for (const [token, file] of cadFilesByToken) {
    const preview = cadPreviewsByToken.get(token);
    attachments.push({
      kind: "cad3d",
      url: file.url,
      renderUrl: preview?.url ?? file.url,
      fileName: file.fileName,
      cadToken: token,
    });
  }

  return attachments;
}

export function isPreviewImageForCad(file: File): boolean {
  const ext = extension(file.name);
  return ["jpg", "jpeg", "png", "webp"].includes(ext) || /image\/(jpeg|jpg|png|webp)/i.test(file.type);
}
