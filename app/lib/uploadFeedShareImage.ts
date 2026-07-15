import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareImageUploadFile } from "./prepareUploadFile";

/** Upload a single image for a listing/job share post (e.g. AI flyer). */
export async function uploadFeedShareImage(
  supabase: SupabaseClient,
  file: File,
  userId: string,
): Promise<string> {
  const prepared = await prepareImageUploadFile(file);
  if (!prepared.ok) throw new Error(prepared.error);

  const imageFile = prepared.file;
  const ext = imageFile.name.includes(".")
    ? imageFile.name.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const filePath = `${userId}/share-posts/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from("feed-images").upload(filePath, imageFile, {
    upsert: false,
    contentType: imageFile.type || "image/jpeg",
  });
  if (error) throw error;

  return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
}
