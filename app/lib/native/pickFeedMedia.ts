import type { RefObject } from "react";
import type { GalleryPhoto, Photo } from "@capacitor/camera";
import type { PickedFile } from "@capawesome/capacitor-file-picker";
import { Capacitor } from "@capacitor/core";
import { isNativeIosApp } from "./isNativeApp";

/** Video and file types — avoids iOS WKWebView camera crash from image/* file inputs. */
export const FEED_VIDEO_PDF_ACCEPT =
  "video/*,.mp4,.mov,.webm,.m4v,.pdf,application/pdf,.svg,image/svg+xml,.tif,.tiff,image/tiff,.stl,.obj,.step,.stp,.iges,.igs,.dwg,.dxf,.3mf";

export type OpenFeedMediaPickerOptions = {
  mediaInputRef: RefObject<HTMLInputElement | null>;
  videoPdfInputRef?: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  remainingSlots?: number;
};

function isUserCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel|dismiss|pickfiles canceled|user denied|no image|no photo/i.test(message);
}

function extensionForFormat(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpeg") return "jpg";
  return normalized.replace(/[^a-z0-9]/g, "") || "jpg";
}

function mimeForFormat(format: string): string {
  const normalized = format.toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  return `image/${normalized}`;
}

function extensionForMime(mimeType: string, fallbackKind: "image" | "video" | "document"): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === "image/jpeg") return "jpg";
  if (normalized === "video/quicktime") return "mov";
  if (normalized === "application/pdf") return "pdf";
  const subtype = normalized.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/g, "");
  if (subtype) return subtype;
  if (fallbackKind === "video") return "mov";
  if (fallbackKind === "document") return "pdf";
  return "jpg";
}

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = window.atob(data);
  const chunks: ArrayBuffer[] = [];
  const chunkSize = 8192;
  for (let offset = 0; offset < binary.length; offset += chunkSize) {
    const slice = binary.slice(offset, offset + chunkSize);
    const buffer = new ArrayBuffer(slice.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < slice.length; i += 1) {
      bytes[i] = slice.charCodeAt(i);
    }
    chunks.push(buffer);
  }
  return new Blob(chunks, { type: mimeType });
}

async function dataUrlToFile(dataUrl: string, format: string, index: number): Promise<File> {
  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }
  const blob = await response.blob();
  const ext = extensionForFormat(format);
  return new File([blob], `photo-${Date.now()}-${index}.${ext}`, {
    type: blob.type || mimeForFormat(format),
    lastModified: Date.now(),
  });
}

async function webPathToFile(webPath: string, format: string, index: number): Promise<File> {
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }
  const blob = await response.blob();
  const ext = extensionForFormat(format);
  const mime = blob.type || mimeForFormat(format);
  return new File([blob], `photo-${Date.now()}-${index}.${ext}`, {
    type: mime,
    lastModified: Date.now(),
  });
}

export async function photoToFile(photo: Photo | GalleryPhoto, index = 0): Promise<File> {
  const format = photo.format || "jpeg";
  if ("dataUrl" in photo && typeof photo.dataUrl === "string") {
    return dataUrlToFile(photo.dataUrl, format, index);
  }
  if (photo.webPath) {
    return webPathToFile(photo.webPath, format, index);
  }
  if (photo.path) {
    return webPathToFile(Capacitor.convertFileSrc(photo.path), format, index);
  }
  throw new Error("Could not read the selected photo.");
}

async function pickedFileToFile(
  pickedFile: PickedFile,
  index: number,
  fallbackKind: "image" | "video" | "document",
): Promise<File> {
  const mimeType = pickedFile.mimeType || (
    fallbackKind === "video" ? "video/quicktime" : fallbackKind === "document" ? "application/pdf" : "image/jpeg"
  );
  const fallbackName = `${fallbackKind}-${Date.now()}-${index}.${extensionForMime(mimeType, fallbackKind)}`;
  const fileName = pickedFile.name || fallbackName;
  const lastModified = pickedFile.modifiedAt ?? Date.now();

  if (pickedFile.blob) {
    return new File([pickedFile.blob], fileName, { type: mimeType, lastModified });
  }

  if (pickedFile.data) {
    return new File([base64ToBlob(pickedFile.data, mimeType)], fileName, { type: mimeType, lastModified });
  }

  if (pickedFile.path) {
    const response = await fetch(Capacitor.convertFileSrc(pickedFile.path));
    if (!response.ok) {
      throw new Error("Could not read the selected file.");
    }
    const blob = await response.blob();
    return new File([blob], fileName, {
      type: blob.type || mimeType,
      lastModified,
    });
  }

  throw new Error("Could not read the selected file.");
}

async function ensureCameraPermission(): Promise<boolean> {
  const { Camera } = await import("@capacitor/camera");
  const status = await Camera.checkPermissions();
  if (status.camera === "granted") return true;
  const requested = await Camera.requestPermissions({ permissions: ["camera"] });
  if (requested.camera === "granted") return true;
  alert("Camera access is required to take photos. You can enable it in Settings.");
  return false;
}

async function ensurePhotosPermission(): Promise<boolean> {
  const { Camera } = await import("@capacitor/camera");
  const status = await Camera.checkPermissions();
  if (status.photos === "granted" || status.photos === "limited") return true;
  const requested = await Camera.requestPermissions({ permissions: ["photos"] });
  if (requested.photos === "granted" || requested.photos === "limited") return true;
  alert("Photo library access is required. You can enable it in Settings.");
  return false;
}

export async function takeNativePhoto(): Promise<File | null> {
  if (!(await ensureCameraPermission())) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });
    return photoToFile(photo);
  } catch (err) {
    if (!isUserCancel(err)) {
      console.error("takeNativePhoto failed:", err);
      alert("Could not open the camera. Please try again.");
    }
    return null;
  }
}

async function pickNativePhotosFromLibrary(limit: number): Promise<File[]> {
  if (!(await ensurePhotosPermission())) return [];
  const { FilePicker } = await import("@capawesome/capacitor-file-picker");
  try {
    const result = await FilePicker.pickImages({
      limit: limit > 0 ? limit : 1,
      ordered: true,
      readData: true,
      skipTranscoding: false,
    });
    return Promise.all(result.files.map((file, index) => pickedFileToFile(file, index, "image")));
  } catch (err) {
    if (!isUserCancel(err)) {
      console.error("pickNativePhotosFromLibrary failed:", err);
      alert("Could not open the photo library. Please try again.");
    }
    return [];
  }
}

async function pickNativeVideosFromLibrary(limit: number): Promise<File[]> {
  const { FilePicker } = await import("@capawesome/capacitor-file-picker");
  try {
    const result = await FilePicker.pickVideos({
      limit: limit > 0 ? limit : undefined,
      ordered: true,
      readData: false,
      skipTranscoding: true,
    });
    return Promise.all(result.files.map((file, index) => pickedFileToFile(file, index, "video")));
  } catch (err) {
    if (!isUserCancel(err)) {
      console.error("pickNativeVideosFromLibrary failed:", err);
      alert("Could not open the video library. Please try again.");
    }
    return [];
  }
}

async function pickNativeDocumentFiles(limit: number): Promise<File[]> {
  const { FilePicker } = await import("@capawesome/capacitor-file-picker");
  try {
    const result = await FilePicker.pickFiles({
      types: [
        "application/pdf",
        "image/svg+xml",
        "image/tiff",
        "model/stl",
        "model/obj",
        "model/step",
        "model/iges",
        "model/3mf",
        "application/acad",
        "image/vnd.dxf",
        "application/octet-stream",
      ],
      limit: limit > 0 ? limit : undefined,
      readData: false,
    });
    return Promise.all(result.files.map((file, index) => pickedFileToFile(file, index, "document")));
  } catch (err) {
    if (!isUserCancel(err)) {
      console.error("pickNativeDocumentFiles failed:", err);
      alert("Could not open the file picker. Please try again.");
    }
    return [];
  }
}

type IosFeedMediaChoice = "camera" | "photos" | "videos" | "file" | "cancel";

let pendingCameraFilesCallback: ((files: File[]) => void) | null = null;

/** Register callback for camera results restored after the OS relaunches the app mid-capture. */
export function setPendingCameraFilesCallback(callback: ((files: File[]) => void) | null) {
  pendingCameraFilesCallback = callback;
}

export async function handleCameraRestoredResult(event: {
  pluginId?: string;
  methodName?: string;
  success?: boolean;
  data?: Record<string, unknown>;
}): Promise<File[]> {
  if (event.pluginId !== "Camera" || !event.success || !event.data) return [];

  try {
    if (event.methodName === "getPhoto" && typeof event.data.webPath === "string") {
      const file = await photoToFile(event.data as unknown as Photo);
      return [file];
    }
    if (event.methodName === "pickImages" && Array.isArray(event.data.photos)) {
      const photos = event.data.photos as GalleryPhoto[];
      return Promise.all(photos.map((photo, index) => photoToFile(photo, index)));
    }
  } catch (err) {
    console.error("handleCameraRestoredResult failed:", err);
  }
  return [];
}

export function deliverRestoredCameraFiles(files: File[]) {
  if (files.length === 0 || !pendingCameraFilesCallback) return;
  pendingCameraFilesCallback(files);
  pendingCameraFilesCallback = null;
}

async function showIosFeedMediaActionSheet(): Promise<IosFeedMediaChoice> {
  const { ActionSheet, ActionSheetButtonStyle } = await import("@capacitor/action-sheet");
  const { index } = await ActionSheet.showActions({
    title: "Add attachment",
    options: [
      { title: "Take Photo" },
      { title: "Photo Library" },
      { title: "Video Library" },
      { title: "File" },
      { title: "Cancel", style: ActionSheetButtonStyle.Cancel },
    ],
  });
  if (index === 0) return "camera";
  if (index === 1) return "photos";
  if (index === 2) return "videos";
  if (index === 3) return "file";
  return "cancel";
}

/** Opens feed media picker — native iOS uses Capacitor Camera to avoid WKWebView camera crash. */
export async function openFeedMediaPicker({
  mediaInputRef,
  videoPdfInputRef,
  onFiles,
  remainingSlots = 10,
}: OpenFeedMediaPickerOptions): Promise<void> {
  if (!isNativeIosApp()) {
    mediaInputRef.current?.click();
    return;
  }

  const choice = await showIosFeedMediaActionSheet();
  if (choice === "cancel") return;

  if (choice === "camera") {
    setPendingCameraFilesCallback(onFiles);
    try {
      const file = await takeNativePhoto();
      if (file) onFiles([file]);
    } finally {
      setPendingCameraFilesCallback(null);
    }
    return;
  }

  if (choice === "photos") {
    setPendingCameraFilesCallback(onFiles);
    try {
      const files = await pickNativePhotosFromLibrary(remainingSlots);
      if (files.length > 0) onFiles(files);
    } finally {
      setPendingCameraFilesCallback(null);
    }
    return;
  }

  if (choice === "videos") {
    const files = await pickNativeVideosFromLibrary(remainingSlots);
    if (files.length > 0) onFiles(files);
    return;
  }

  if (choice === "file") {
    const files = await pickNativeDocumentFiles(remainingSlots);
    if (files.length > 0) onFiles(files);
    return;
  }

  videoPdfInputRef?.current?.click();
}
