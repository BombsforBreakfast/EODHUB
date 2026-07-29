import { supabase } from "@/app/lib/lib/supabaseClient";
import { prepareImageUploadFile } from "@/app/lib/prepareUploadFile";
import { validateImagePick } from "@/app/lib/uploadLimits";

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type.includes("png")) return "png";
  if (file.type.includes("webp")) return "webp";
  if (file.type.includes("gif")) return "gif";
  return "jpg";
}

/**
 * Upload a manual job listing photo to feed-images/{userId}/job-covers and return the public URL.
 */
export async function uploadJobCoverImage(file: File, userId: string): Promise<string> {
  const pickError = validateImagePick(file);
  if (pickError) throw new Error(pickError);

  const prepared = await prepareImageUploadFile(file);
  if (!prepared.ok) throw new Error(prepared.error);

  const uploadFile = prepared.file;
  const ext = extFromFile(uploadFile);
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 64) || "user";
  const path = `${safeUser}/job-covers/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from("feed-images").upload(path, uploadFile, {
    upsert: false,
    contentType: uploadFile.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("feed-images").getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Failed to resolve uploaded job photo URL.");
  return data.publicUrl;
}
