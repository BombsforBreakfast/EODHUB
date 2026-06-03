import type { SupabaseClient } from "@supabase/supabase-js";

type ShareJobResult = {
  ok: boolean;
  postId?: string;
  error?: string;
};

export async function shareJobToFeed(
  supabase: SupabaseClient,
  jobId: string,
  content?: string,
): Promise<ShareJobResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be logged in to share." };

  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content?.trim() ?? "" }),
  });
  const json = await res.json().catch(() => null) as { postId?: string; error?: string } | null;

  if (!res.ok || !json?.postId) {
    return { ok: false, error: json?.error ?? "Could not share this job to the feed." };
  }

  return { ok: true, postId: json.postId };
}
