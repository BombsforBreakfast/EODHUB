import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareMessagePhotoUploadFile } from "./prepareUploadFile";

export async function uploadMessagePhoto(
  supabase: SupabaseClient,
  file: File,
  args: { userId: string; conversationId: string },
): Promise<string> {
  const prepared = await prepareMessagePhotoUploadFile(file);
  if (!prepared.ok) throw new Error(prepared.error);

  const imageFile = prepared.file;
  const ext = imageFile.name.includes(".")
    ? imageFile.name.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const filePath = `${args.userId}/messages/${args.conversationId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from("feed-images").upload(filePath, imageFile, {
    upsert: false,
    contentType: imageFile.type || "image/jpeg",
  });
  if (error) throw error;

  return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
}
