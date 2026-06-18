import type { RefObject } from "react";
import type { GalleryPhoto, Photo } from "@capacitor/camera";
import { isNativeIosApp } from "./isNativeApp";

/** Video and PDF only — avoids iOS WKWebView camera crash from image/* file inputs. */
export const FEED_VIDEO_PDF_ACCEPT = "video/*,.mp4,.mov,.webm,.m4v,.pdf,application/pdf";

export type OpenFeedMediaPickerOptions = {
  mediaInputRef: RefObject<HTMLInputElement | null>;
  videoPdfInputRef?: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  remainingSlots?: number;
};

function isUserCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel|dismiss|user denied|no image|no photo/i.test(message);
}

async function webPathToFile(webPath: string, format: string, index: number): Promise<File> {
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error("Could not read the selected photo.");
  }
  const blob = await response.blob();
  const ext = format === "jpeg" ? "jpg" : format;
  const mime = blob.type || `image/${format === "jpg" ? "jpeg" : format}`;
  return new File([blob], `photo-${Date.now()}-${index}.${ext}`, {
    type: mime,
    lastModified: Date.now(),
  });
}

export async function photoToFile(photo: Photo | GalleryPhoto, index = 0): Promise<File> {
  if (!photo.webPath) throw new Error("Could not read the captured photo.");
  return webPathToFile(photo.webPath, photo.format || "jpeg", index);
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
      resultType: CameraResultType.Uri,
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
  const { Camera } = await import("@capacitor/camera");
  try {
    const result = await Camera.pickImages({
      quality: 90,
      limit: limit > 0 ? limit : undefined,
    });
    return Promise.all(result.photos.map((photo, index) => photoToFile(photo, index)));
  } catch (err) {
    if (!isUserCancel(err)) {
      console.error("pickNativePhotosFromLibrary failed:", err);
      alert("Could not open the photo library. Please try again.");
    }
    return [];
  }
}

type IosFeedMediaChoice = "camera" | "library" | "videoPdf" | "cancel";

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
      const file = await photoToFile(event.data as Photo);
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
      { title: "Video or PDF" },
      { title: "Cancel", style: ActionSheetButtonStyle.Cancel },
    ],
  });
  if (index === 0) return "camera";
  if (index === 1) return "library";
  if (index === 2) return "videoPdf";
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

  if (choice === "library") {
    setPendingCameraFilesCallback(onFiles);
    try {
      const files = await pickNativePhotosFromLibrary(remainingSlots);
      if (files.length > 0) onFiles(files);
    } finally {
      setPendingCameraFilesCallback(null);
    }
    return;
  }

  if (videoPdfInputRef?.current) {
    videoPdfInputRef.current.click();
  } else {
    alert("Video and PDF picking is not available here.");
  }
}
