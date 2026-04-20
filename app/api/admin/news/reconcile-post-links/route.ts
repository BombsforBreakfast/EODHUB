import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";

type NewsItemRow = {
  id: string;
  status: "pending" | "published" | "rejected";
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  ingested_at: string;
  shadow_post_id: string | null;
};

type LinkedPostRow = {
  id: string;
  news_item_id: string | null;
  content_type: string | null;
  system_generated: boolean | null;
};

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return { userId: authData.user.id };
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function buildNewsPostContent(item: Pick<NewsItemRow, "headline" | "summary">): string {
  const headline = item.headline?.trim() ?? "";
  const summary = item.summary?.trim() ?? "";
  if (!summary) return headline;
  return `${headline}\n\n${summary}`;
}

type ReconcilePlan = {
  publishedMissingPost: NewsItemRow[];
  publishedShadowMismatch: Array<{ newsItemId: string; currentShadowPostId: string | null; shouldBePostId: string }>;
  nonPublishedWithPost: Array<{ newsItemId: string; status: NewsItemRow["status"]; postId: string }>;
  nonPublishedWithShadowPointer: Array<{ newsItemId: string; status: NewsItemRow["status"]; shadowPostId: string }>;
  linkedPostsWrongShape: Array<{ postId: string; newsItemId: string; contentType: string | null; systemGenerated: boolean | null }>;
};

function buildPlan(newsItems: NewsItemRow[], linkedPosts: LinkedPostRow[]): ReconcilePlan {
  const published = newsItems.filter((n) => n.status === "published");
  const nonPublished = newsItems.filter((n) => n.status !== "published");

  const postsByNewsId = new Map<string, LinkedPostRow>();
  for (const p of linkedPosts) {
    if (p.news_item_id) postsByNewsId.set(p.news_item_id, p);
  }

  const publishedMissingPost = published.filter((n) => !postsByNewsId.has(n.id));
  const publishedShadowMismatch = published
    .map((n) => {
      const linked = postsByNewsId.get(n.id);
      if (!linked) return null;
      if (n.shadow_post_id === linked.id) return null;
      return {
        newsItemId: n.id,
        currentShadowPostId: n.shadow_post_id,
        shouldBePostId: linked.id,
      };
    })
    .filter((v): v is { newsItemId: string; currentShadowPostId: string | null; shouldBePostId: string } => Boolean(v));

  const nonPublishedWithPost = nonPublished
    .map((n) => {
      const linked = postsByNewsId.get(n.id);
      if (!linked) return null;
      return { newsItemId: n.id, status: n.status, postId: linked.id };
    })
    .filter((v): v is { newsItemId: string; status: NewsItemRow["status"]; postId: string } => Boolean(v));

  const nonPublishedWithShadowPointer = nonPublished
    .filter((n) => Boolean(n.shadow_post_id))
    .map((n) => ({ newsItemId: n.id, status: n.status, shadowPostId: n.shadow_post_id! }));

  const linkedPostsWrongShape = published
    .map((n) => {
      const linked = postsByNewsId.get(n.id);
      if (!linked) return null;
      if (linked.content_type === "news" && linked.system_generated === true) return null;
      return {
        postId: linked.id,
        newsItemId: n.id,
        contentType: linked.content_type ?? null,
        systemGenerated: linked.system_generated ?? null,
      };
    })
    .filter((v): v is { postId: string; newsItemId: string; contentType: string | null; systemGenerated: boolean | null } => Boolean(v));

  return {
    publishedMissingPost,
    publishedShadowMismatch,
    nonPublishedWithPost,
    nonPublishedWithShadowPointer,
    linkedPostsWrongShape,
  };
}

async function fetchState(supabase: ReturnType<typeof adminClient>) {
  const [{ data: newsItems, error: newsErr }, { data: linkedPosts, error: postsErr }] = await Promise.all([
    supabase
      .from("news_items")
      .select("id, status, headline, summary, source_name, source_url, canonical_url, thumbnail_url, published_at, ingested_at, shadow_post_id"),
    supabase
      .from("posts")
      .select("id, news_item_id, content_type, system_generated")
      .not("news_item_id", "is", null),
  ]);

  if (newsErr) throw new Error(newsErr.message);
  if (postsErr) throw new Error(postsErr.message);

  return {
    newsItems: (newsItems ?? []) as NewsItemRow[],
    linkedPosts: (linkedPosts ?? []) as LinkedPostRow[],
  };
}

async function applyPlan(supabase: ReturnType<typeof adminClient>, plan: ReconcilePlan) {
  // 1) Create missing posts for published items.
  if (plan.publishedMissingPost.length > 0) {
    const inserts = plan.publishedMissingPost.map((item) => ({
      user_id: RUMINT_USER_ID,
      content: buildNewsPostContent(item),
      og_url: item.canonical_url ?? item.source_url,
      og_title: item.headline,
      og_description: item.summary,
      og_image: item.thumbnail_url,
      og_site_name: item.source_name,
      news_item_id: item.id,
      content_type: "news",
      system_generated: true,
      created_at: item.published_at ?? item.ingested_at ?? new Date().toISOString(),
    }));
    const { error } = await supabase.from("posts").insert(inserts);
    if (error) throw new Error(`insert missing posts failed: ${error.message}`);
  }

  // 2) Remove posts tied to non-published items.
  if (plan.nonPublishedWithPost.length > 0) {
    const postIds = plan.nonPublishedWithPost.map((x) => x.postId);
    const { error } = await supabase.from("posts").delete().in("id", postIds);
    if (error) throw new Error(`delete stale posts failed: ${error.message}`);
  }

  // 3) Clear stale shadow pointers on non-published items.
  if (plan.nonPublishedWithShadowPointer.length > 0) {
    const newsIds = plan.nonPublishedWithShadowPointer.map((x) => x.newsItemId);
    const { error } = await supabase
      .from("news_items")
      .update({ shadow_post_id: null })
      .in("id", newsIds);
    if (error) throw new Error(`clear stale shadow pointers failed: ${error.message}`);
  }

  // 4) Ensure published news points to the linked post id.
  //    (re-fetch linked map after inserts/deletes)
  const { data: linkedAfter, error: linkedAfterErr } = await supabase
    .from("posts")
    .select("id, news_item_id")
    .not("news_item_id", "is", null);
  if (linkedAfterErr) throw new Error(`reload linked posts failed: ${linkedAfterErr.message}`);
  const postIdByNewsId = new Map<string, string>();
  ((linkedAfter ?? []) as Array<{ id: string; news_item_id: string | null }>).forEach((p) => {
    if (p.news_item_id) postIdByNewsId.set(p.news_item_id, p.id);
  });

  // Keep this as targeted row updates to avoid accidental broad writes.
  for (const [newsItemId, postId] of postIdByNewsId.entries()) {
    const { error } = await supabase
      .from("news_items")
      .update({ shadow_post_id: postId })
      .eq("id", newsItemId)
      .eq("status", "published");
    if (error) throw new Error(`update published shadow pointer failed: ${error.message}`);
  }

  // 5) Force shape on linked published news posts.
  const publishedNewsIds = Array.from(postIdByNewsId.keys());
  if (publishedNewsIds.length > 0) {
    const { error } = await supabase
      .from("posts")
      .update({ content_type: "news", system_generated: true })
      .in("news_item_id", publishedNewsIds);
    if (error) throw new Error(`normalize linked post shape failed: ${error.message}`);
  }
}

function summary(plan: ReconcilePlan) {
  return {
    missingPostsForPublished: plan.publishedMissingPost.length,
    publishedShadowPointerMismatches: plan.publishedShadowMismatch.length,
    stalePostsOnNonPublished: plan.nonPublishedWithPost.length,
    staleShadowPointersOnNonPublished: plan.nonPublishedWithShadowPointer.length,
    linkedPostsWrongShape: plan.linkedPostsWrongShape.length,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = adminClient();
    const state = await fetchState(supabase);
    const plan = buildPlan(state.newsItems, state.linkedPosts);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      summary: summary(plan),
      samples: {
        publishedMissingPost: plan.publishedMissingPost.slice(0, 10).map((x) => ({ id: x.id, headline: x.headline })),
        publishedShadowMismatch: plan.publishedShadowMismatch.slice(0, 10),
        nonPublishedWithPost: plan.nonPublishedWithPost.slice(0, 10),
        nonPublishedWithShadowPointer: plan.nonPublishedWithShadowPointer.slice(0, 10),
        linkedPostsWrongShape: plan.linkedPostsWrongShape.slice(0, 10),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

type ReconcileBody = {
  dryRun?: boolean;
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: ReconcileBody = {};
  try {
    body = (await req.json()) as ReconcileBody;
  } catch {
    // Empty/invalid body -> treat as {}
    body = {};
  }

  try {
    const supabase = adminClient();
    const beforeState = await fetchState(supabase);
    const before = buildPlan(beforeState.newsItems, beforeState.linkedPosts);
    if (body.dryRun === true) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        summary: summary(before),
      });
    }

    await applyPlan(supabase, before);
    const afterState = await fetchState(supabase);
    const after = buildPlan(afterState.newsItems, afterState.linkedPosts);

    return NextResponse.json({
      ok: true,
      dryRun: false,
      before: summary(before),
      after: summary(after),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

