"use client";

import type { MouseEvent } from "react";
import { isNativeApp } from "./isNativeApp";

type OpenNativeDocumentOptions = {
  url: string;
  contentType?: string;
};

function contentTypeFromUrl(url: string): string | undefined {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".pdf")) return "application/pdf";
  if (clean.endsWith(".doc")) return "application/msword";
  if (clean.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (clean.endsWith(".txt")) return "text/plain";
  if (clean.endsWith(".rtf")) return "application/rtf";
  if (clean.endsWith(".odt")) return "application/vnd.oasis.opendocument.text";
  return undefined;
}

function extensionFromMime(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("wordprocessingml.document")) return "docx";
  if (normalized.includes("msword")) return "doc";
  if (normalized.includes("rtf")) return "rtf";
  if (normalized.includes("text/plain")) return "txt";
  return "bin";
}

function extensionFromUrl(url: string): string {
  const clean = url.split("?")[0]?.split("#")[0] ?? "";
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function parseFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const utf8Match = header.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = header.match(/filename="([^"]+)"/i);
  return quotedMatch?.[1] ?? null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read downloaded document."));
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : "";
      if (!base64) {
        reject(new Error("Could not decode downloaded document."));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

function withDownloadMode(url: URL): URL {
  const next = new URL(url.toString());
  next.searchParams.set("mode", "download");
  return next;
}

function normalizeDownloadUrl(url: string): string {
  if (typeof window === "undefined") return url;
  const absolute = new URL(url, window.location.origin);

  if (absolute.pathname === "/employer/document") {
    const userId = absolute.searchParams.get("userId");
    const kind = absolute.searchParams.get("kind");
    const tag = absolute.searchParams.get("tag");
    if (userId && kind) {
      const apiUrl = new URL("/api/employer/candidate-document", absolute.origin);
      apiUrl.searchParams.set("userId", userId);
      apiUrl.searchParams.set("kind", kind);
      if (tag) apiUrl.searchParams.set("tag", tag);
      apiUrl.searchParams.set("mode", "download");
      return apiUrl.toString();
    }
  }

  if (absolute.pathname === "/api/employer/candidate-document") {
    return withDownloadMode(absolute).toString();
  }

  return absolute.toString();
}

export async function openNativeDocument({ url, contentType }: OpenNativeDocumentOptions): Promise<void> {
  if (!isNativeApp()) {
    window.open(url, "_blank", "noreferrer");
    return;
  }

  const downloadUrl = normalizeDownloadUrl(url);
  const response = await fetch(downloadUrl, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not download document (${response.status}).`);
  }

  const blob = await response.blob();
  const resolvedContentType =
    contentType ??
    response.headers.get("content-type") ??
    contentTypeFromUrl(downloadUrl) ??
    "application/octet-stream";
  const headerFilename = parseFilenameFromContentDisposition(response.headers.get("content-disposition"));
  const guessedExt =
    extensionFromUrl(headerFilename ?? "") ||
    extensionFromUrl(downloadUrl) ||
    extensionFromMime(resolvedContentType);
  const safeExt = guessedExt.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const safeName =
    (headerFilename ?? `document-${Date.now()}.${safeExt}`)
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/_+/g, "_");

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { FileOpener } = await import("@capacitor-community/file-opener");
  const filePath = `eodhub/docs/${Date.now()}-${safeName}`;
  const data = await blobToBase64(blob);

  await Filesystem.writeFile({
    path: filePath,
    data,
    directory: Directory.Cache,
    recursive: true,
  });

  const uri = await Filesystem.getUri({
    path: filePath,
    directory: Directory.Cache,
  });

  const openPath = uri.uri;
  await FileOpener.open({
    filePath: openPath,
    contentType: resolvedContentType,
    openWithDefault: true,
  });
}

export async function openDocumentLink(event: MouseEvent<HTMLAnchorElement>, url: string, contentType?: string) {
  if (!isNativeApp()) return;
  event.preventDefault();
  try {
    await openNativeDocument({ url, contentType });
  } catch (err) {
    console.error("openNativeDocument failed:", err);
    window.location.href = url;
  }
}
