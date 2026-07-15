import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { muxFeedVideoUrl, type FeedVideoStatus } from "../feedVideoUrl";

export function feedVideoAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export async function authenticatedUser(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function approvedMuxCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const allowed = new Set([
    "https://eod-hub.com",
    "https://www.eod-hub.com",
    "https://eodhub.vercel.app",
    "capacitor://localhost",
    "http://localhost",
    "http://localhost:3000",
    "https://localhost",
  ]);
  const configured = process.env.MUX_ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean) ?? [];
  configured.forEach((value) => allowed.add(value));
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  return allowed.has(origin) ? origin : null;
}

export async function syncFeedVideoAttachmentUrl(
  admin: SupabaseClient,
  video: {
    id: string;
    post_id?: string | null;
    unit_post_id?: string | null;
    status: FeedVideoStatus;
    mux_playback_id?: string | null;
  },
): Promise<void> {
  const imageUrl = muxFeedVideoUrl(video.id, video.status, video.mux_playback_id);
  const prefix = `mux://feed-video/${video.id}/`;

  if (video.post_id) {
    const { error } = await admin
      .from("post_images")
      .update({ image_url: imageUrl, file_type: "video" })
      .eq("post_id", video.post_id)
      .like("image_url", `${prefix}%`);
    if (error) throw error;
    const { error: legacyError } = await admin
      .from("posts")
      .update({ image_url: imageUrl })
      .eq("id", video.post_id)
      .like("image_url", `${prefix}%`);
    if (legacyError) throw legacyError;
  }
  if (video.unit_post_id) {
    const { error } = await admin
      .from("unit_post_images")
      .update({ image_url: imageUrl })
      .eq("unit_post_id", video.unit_post_id)
      .like("image_url", `${prefix}%`);
    if (error) throw error;
    const { error: legacyError } = await admin
      .from("unit_posts")
      .update({ photo_url: imageUrl })
      .eq("id", video.unit_post_id)
      .like("photo_url", `${prefix}%`);
    if (legacyError) throw legacyError;
  }
}
