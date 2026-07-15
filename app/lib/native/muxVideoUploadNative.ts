import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type NativeMuxUploadProgress = {
  uploadId: string;
  percent: number;
};

type NativeMuxVideoUploadPlugin = {
  upload(options: {
    uploadId: string;
    uploadUrl: string;
    filePath: string;
  }): Promise<void>;
  cancel(options: { uploadId: string }): Promise<void>;
  addListener(
    eventName: "progress",
    listener: (event: NativeMuxUploadProgress) => void,
  ): Promise<PluginListenerHandle>;
};

const NativeMuxVideoUpload = registerPlugin<NativeMuxVideoUploadPlugin>("MuxVideoUpload");

export async function uploadNativeMuxVideo(
  options: {
    uploadId: string;
    uploadUrl: string;
    filePath: string;
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const listener = await NativeMuxVideoUpload.addListener("progress", (event) => {
    if (event.uploadId === options.uploadId) {
      options.onProgress?.(Math.max(0, Math.min(100, event.percent)));
    }
  });

  const abort = () => {
    void NativeMuxVideoUpload.cancel({ uploadId: options.uploadId });
  };

  try {
    if (options.signal?.aborted) {
      throw new DOMException("Upload cancelled.", "AbortError");
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    await NativeMuxVideoUpload.upload({
      uploadId: options.uploadId,
      uploadUrl: options.uploadUrl,
      filePath: options.filePath,
    });
    options.onProgress?.(100);
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await listener.remove();
  }
}
