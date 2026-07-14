import { getAccessToken } from "./lib/supabaseClient";

const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

function uploadContentType(file: File): string {
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  if (/\.(mp4|m4v)$/i.test(file.name)) return "video/mp4";
  if (/\.webm$/i.test(file.name)) return "video/webm";
  return file.type || "application/octet-stream";
}

function resumableStorageEndpoint(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error("Supabase is not configured.");
  }

  const url = new URL(supabaseUrl);
  const projectRef = url.hostname.endsWith(".supabase.co")
    ? url.hostname.split(".")[0]
    : null;

  return projectRef
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : `${url.origin}/storage/v1/upload/resumable`;
}

/** Upload large feed media in retryable 6 MB chunks for mobile network reliability. */
export async function uploadResumableFeedFile(file: File, filePath: string): Promise<void> {
  const accessToken = await getAccessToken({
    force: true,
    source: "uploadResumableFeedFile",
  });
  if (!accessToken) {
    throw new Error("Your session expired. Sign in again and retry the upload.");
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { Upload } = await import("tus-js-client");

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: resumableStorageEndpoint(),
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(anonKey ? { apikey: anonKey } : {}),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: "feed-images",
        objectName: filePath,
        contentType: uploadContentType(file),
        cacheControl: "3600",
      },
      onError: reject,
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(reject);
  });
}
