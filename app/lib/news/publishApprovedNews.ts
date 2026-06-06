import type { SupabaseClient } from "@supabase/supabase-js";
import { RUMINT_USER_ID } from "@/app/lib/userDirectory";

const NEWS_RELEASE_INTERVAL_MINUTES = Math.max(
  15,
  Number(process.env.NEWS_RELEASE_INTERVAL_MINUTES ?? 90) || 90,
);
const NEWS_RELEASE_INTERVAL_MS = NEWS_RELEASE_INTERVAL_MINUTES * 60 * 1000;

export type PublishedNewsRow = {
  id: string;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  thumbnail_url: string | null;
  admin_manual_image_url: string | null;
  relevance_score: number | null;
  published_at: string | null;
  ingested_at: string;
  approved_at: string | null;
  release_at: string | null;
};

type AdminSupabase = SupabaseClient;

function buildNewsPostContent(item: Pick<PublishedNewsRow, "headline" | "summary">): string {
  const headline = item.headline?.trim() ?? "";
  const summary = item.summary?.trim() ?? "";
  if (!summary) return headline;
  return `${headline}\n\n${summary}`;
}

/** Stagger approved news: first slot now (or after queued future releases), +90m per item. */
async function allocateReleaseSlots(
  supabase: AdminSupabase,
  count: number,
  excludeNewsItemIds: string[] = [],
): Promise<string[]> {
  if (count <= 0) return [];

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const exclude = new Set(excludeNewsItemIds);
  const { data: futureNewsPosts, error } = await supabase
    .from("posts")
    .select("created_at, news_item_id")
    .eq("content_type", "news")
    .gt("created_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  const latestFutureMs = ((futureNewsPosts ?? []) as Array<{
    created_at: string;
    news_item_id: string | null;
  }>)
    .filter((row) => row.news_item_id && !exclude.has(row.news_item_id))
    .map((row) => Date.parse(row.created_at))
    .find((ms) => Number.isFinite(ms));

  const startMs =
    latestFutureMs !== undefined ? latestFutureMs + NEWS_RELEASE_INTERVAL_MS : nowMs;

  return Array.from({ length: count }, (_, i) =>
    new Date(startMs + i * NEWS_RELEASE_INTERVAL_MS).toISOString(),
  );
}

/** Create or refresh RUMINT shadow posts for published news_items rows. */
export async function ensurePublishedNewsPosts(
  supabase: AdminSupabase,
  newsItemIds: string[],
) {
  if (newsItemIds.length === 0) return;

  const idOrder = new Map(newsItemIds.map((id, idx) => [id, idx]));
  const { data: newsRows, error: newsErr } = await supabase
    .from("news_items")
    .select(
      "id, headline, summary, source_name, source_url, canonical_url, thumbnail_url, admin_manual_image_url, relevance_score, published_at, ingested_at, approved_at, release_at",
    )
    .in("id", newsItemIds)
    .eq("status", "published");
  if (newsErr) throw new Error(newsErr.message);
  const items = ((newsRows ?? []) as PublishedNewsRow[]).sort((a, b) => {
    const ao = idOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bo = idOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const ar = a.relevance_score ?? -1;
    const br = b.relevance_score ?? -1;
    return br - ar;
  });
  if (items.length === 0) return;

  const { data: existingPosts, error: existingErr } = await supabase
    .from("posts")
    .select("id, news_item_id, created_at")
    .in("news_item_id", items.map((i) => i.id));
  if (existingErr) throw new Error(existingErr.message);
  const existingByNewsId = new Map<string, { id: string; created_at: string }>();
  (
    (existingPosts ?? []) as Array<{ id: string; news_item_id: string | null; created_at: string }>
  ).forEach((p) => {
    if (p.news_item_id) existingByNewsId.set(p.news_item_id, { id: p.id, created_at: p.created_at });
  });

  const missing = items.filter((item) => !existingByNewsId.has(item.id));
  const releaseTimes = await allocateReleaseSlots(
    supabase,
    items.length,
    items.map((item) => item.id),
  );
  const releaseAtByNewsId = new Map<string, string>();
  items.forEach((item, idx) => {
    releaseAtByNewsId.set(item.id, releaseTimes[idx] ?? releaseTimes[0] ?? new Date().toISOString());
  });

  const inserts = missing.map((item) => ({
    user_id: RUMINT_USER_ID,
    content: buildNewsPostContent(item),
    og_url: item.canonical_url ?? item.source_url,
    og_title: item.headline,
    og_description: item.summary,
    og_image: item.admin_manual_image_url ?? item.thumbnail_url,
    og_site_name: item.source_name,
    news_item_id: item.id,
    content_type: "news",
    system_generated: true,
    created_at: releaseAtByNewsId.get(item.id) ?? new Date().toISOString(),
  }));
  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("posts").insert(inserts);
    if (insertErr) throw new Error(insertErr.message);
  }

  const existingToRefresh = items.filter((item) => existingByNewsId.has(item.id));
  for (const item of existingToRefresh) {
    const linked = existingByNewsId.get(item.id);
    if (!linked) continue;
    const releaseAt = releaseAtByNewsId.get(item.id);
    if (!releaseAt) continue;
    const { error: refreshErr } = await supabase
      .from("posts")
      .update({ created_at: releaseAt })
      .eq("id", linked.id);
    if (refreshErr) throw new Error(refreshErr.message);
  }

  const { data: allPosts, error: allPostsErr } = await supabase
    .from("posts")
    .select("id, news_item_id, created_at")
    .in("news_item_id", items.map((i) => i.id));
  if (allPostsErr) throw new Error(allPostsErr.message);
  const postByNewsId = new Map<string, { id: string; created_at: string }>();
  (
    (allPosts ?? []) as Array<{ id: string; news_item_id: string | null; created_at: string }>
  ).forEach((p) => {
    if (p.news_item_id) postByNewsId.set(p.news_item_id, { id: p.id, created_at: p.created_at });
  });

  for (const item of items) {
    const linkedPost = postByNewsId.get(item.id);
    if (!linkedPost) continue;
    const releaseAt = linkedPost.created_at;
    const { error: updateErr } = await supabase
      .from("news_items")
      .update({ shadow_post_id: linkedPost.id, release_at: releaseAt })
      .eq("id", item.id);
    if (updateErr) throw new Error(updateErr.message);
  }
}

export async function removeNewsPosts(supabase: AdminSupabase, newsItemIds: string[]) {
  if (newsItemIds.length === 0) return;
  const { error: postDeleteErr } = await supabase
    .from("posts")
    .delete()
    .in("news_item_id", newsItemIds);
  if (postDeleteErr) throw new Error(postDeleteErr.message);
  const { error: clearShadowErr } = await supabase
    .from("news_items")
    .update({ shadow_post_id: null, release_at: null })
    .in("id", newsItemIds);
  if (clearShadowErr) throw new Error(clearShadowErr.message);
}
