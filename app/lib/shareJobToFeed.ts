import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShareListingPreview } from "../components/ShareListingToFeedModal";

type ShareJobResult = {
  ok: boolean;
  postId?: string;
  error?: string;
};

export type JobShareSource = {
  id: string;
  apply_url: string | null;
  title?: string | null;
  company_name?: string | null;
  description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  og_site_name?: string | null;
};

export function jobSharePreview(job: JobShareSource): ShareListingPreview {
  return {
    id: job.id,
    website_url: job.apply_url,
    business_name: job.title || job.og_title || "Job listing",
    custom_blurb: job.description || job.og_description,
    og_title: job.og_title || job.title,
    og_description: job.og_description || job.description,
    og_image: job.og_image,
    og_site_name: job.og_site_name || job.company_name || "Jobs",
  };
}

export async function shareJobToFeed(
  supabase: SupabaseClient,
  jobId: string,
  content?: string,
  postAsUserId?: string | null,
): Promise<ShareJobResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "You must be logged in to share." };

  const body: { content: string; post_as_user_id?: string } = { content: content?.trim() ?? "" };
  if (postAsUserId) body.post_as_user_id = postAsUserId;

  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/share`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null) as { postId?: string; error?: string } | null;

  if (!res.ok || !json?.postId) {
    return { ok: false, error: json?.error ?? "Could not share this job to the feed." };
  }

  return { ok: true, postId: json.postId };
}
