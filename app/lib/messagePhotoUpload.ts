import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareMessagePhotoUploadFile } from "./prepareUploadFile";

export async function uploadMessagePhoto(
  supabase: SupabaseClient,
  file: File,
  args: { userId: string; conversationId: string },
): Promise<string> {
  return uploadChatImage(supabase, file, `${args.userId}/messages/${args.conversationId}`);
}

/** Team Room photo — same storage bucket, chatroom path prefix. */
export async function uploadChatroomPhoto(
  supabase: SupabaseClient,
  file: File,
  userId: string,
): Promise<string> {
  return uploadChatImage(supabase, file, `${userId}/chatroom`);
}

async function uploadChatImage(
  supabase: SupabaseClient,
  file: File,
  pathPrefix: string,
): Promise<string> {
  const prepared = await prepareMessagePhotoUploadFile(file);
  if (!prepared.ok) throw new Error(prepared.error);

  const imageFile = prepared.file;
  const ext = imageFile.name.includes(".")
    ? imageFile.name.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from("feed-images").upload(filePath, imageFile, {
    upsert: false,
    contentType: imageFile.type || "image/jpeg",
  });
  if (error) throw error;

  return supabase.storage.from("feed-images").getPublicUrl(filePath).data.publicUrl;
}
