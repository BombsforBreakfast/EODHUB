import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostAsMode } from "./postAsIdentity";
import { uploadFeedShareImage } from "./uploadFeedShareImage";

type ShareJobResult = {
  ok: boolean;
  postId?: string;
  error?: string;
};

export async function shareJobToFeed(
  supabase: SupabaseClient,
  jobId: string,
  content?: string,
  postAsMode?: PostAsMode,
  photoFile?: File | null,
): Promise<ShareJobResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user?.id;
  if (!token || !userId) return { ok: false, error: "You must be logged in to share." };

  let imageUrls: string[] = [];
  if (photoFile) {
    try {
      imageUrls = [await uploadFeedShareImage(supabase, photoFile, userId)];
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Could not upload photo.",
      };
    }
  }

  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: content?.trim() ?? "",
      ...(postAsMode ? { postAsMode } : {}),
      ...(imageUrls.length > 0 ? { imageUrls } : {}),
    }),
  });
  const json = await res.json().catch(() => null) as { postId?: string; error?: string } | null;

  if (!res.ok || !json?.postId) {
    return { ok: false, error: json?.error ?? "Could not share this job to the feed." };
  }

  return { ok: true, postId: json.postId };
}
