import type { SupabaseClient } from "@supabase/supabase-js";

type ShareListingResult = {
  ok: boolean;
  postId?: string;
  error?: string;
};

export async function shareListingToFeed(
  supabase: SupabaseClient,
  listingId: string,
  content?: string,
  postAsUserId?: string | null,
): Promise<ShareListingResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be logged in to share." };

  const body: { content: string; post_as_user_id?: string } = { content: content?.trim() ?? "" };
  if (postAsUserId) body.post_as_user_id = postAsUserId;

  const res = await fetch(`/api/business-listings/${encodeURIComponent(listingId)}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null) as { postId?: string; error?: string } | null;

  if (!res.ok || !json?.postId) {
    return { ok: false, error: json?.error ?? "Could not share to the feed." };
  }

  return { ok: true, postId: json.postId };
}
