import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Admin approval queue for news_items.
//
// GET  /api/admin/news?status=pending|published|rejected (default: pending)
// POST /api/admin/news  body:
//        single:        { id: string,   action: 'approve' | 'reject' }
//        bulk by id:    { ids: string[],action: 'approve' | 'reject' }
//        bulk by status:{ scope: 'all', status: 'pending'|'published'|'rejected', action: 'reject'|'approve' }
//        hard delete:   { ids: string[],action: 'delete' }
//                       { scope: 'all', status: 'rejected',     action: 'delete' }
//
// Auth: bearer token must belong to a profile with is_admin = true.
// Writes use service_role (RLS denies direct client writes by design).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Status = "pending" | "published" | "rejected";
const RUMINT_USER_ID = "ffffffff-ffff-4fff-afff-52554d494e54";
const NEWS_RELEASE_INTERVAL_MINUTES = Math.max(
  15,
  Number(process.env.NEWS_RELEASE_INTERVAL_MINUTES ?? 90) || 90
);
const NEWS_RELEASE_INTERVAL_MS = NEWS_RELEASE_INTERVAL_MINUTES * 60 * 1000;

type PublishedNewsRow = {
  id: string;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
  canonical_url: string | null;
  thumbnail_url: string | null;
  relevance_score: number | null;
  published_at: string | null;
  ingested_at: string;
  approved_at: string | null;
  release_at: string | null;
};

async function requireAdmin(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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

function buildNewsPostContent(item: Pick<PublishedNewsRow, "headline" | "summary">): string {
  const headline = item.headline?.trim() ?? "";
  const summary = item.summary?.trim() ?? "";
  if (!summary) return headline;
  return `${headline}\n\n${summary}`;
}

async function allocateReleaseSlots(
  supabase: ReturnType<typeof adminClient>,
  count: number
): Promise<string[]> {
  if (count <= 0) return [];

  const { data: latestNewsPost } = await supabase
    .from("posts")
    .select("created_at")
    .eq("content_type", "news")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nowMs = Date.now();
  const latestMs = Date.parse(
    ((latestNewsPost as { created_at?: string | null } | null)?.created_at ?? "")
  );
  const startMs = Number.isFinite(latestMs)
    ? Math.max(nowMs, latestMs + NEWS_RELEASE_INTERVAL_MS)
    : nowMs;

  return Array.from({ length: count }, (_, i) =>
    new Date(startMs + i * NEWS_RELEASE_INTERVAL_MS).toISOString()
  );
}

async function ensurePublishedNewsPosts(supabase: ReturnType<typeof adminClient>, newsItemIds: string[]) {
  if (newsItemIds.length === 0) return;

  const idOrder = new Map(newsItemIds.map((id, idx) => [id, idx]));
  const { data: newsRows, error: newsErr } = await supabase
    .from("news_items")
    .select("id, headline, summary, source_name, source_url, canonical_url, thumbnail_url, relevance_score, published_at, ingested_at, approved_at, release_at")
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
  const missingWithoutRelease = missing.filter((item) => !item.release_at);
  const slots = await allocateReleaseSlots(supabase, missingWithoutRelease.length);
  const slotByNewsId = new Map<string, string>();
  missingWithoutRelease.forEach((item, idx) => {
    slotByNewsId.set(item.id, slots[idx]);
  });

  const inserts = missing.map((item) => {
    const scheduledReleaseAt =
      item.release_at ??
      slotByNewsId.get(item.id) ??
      item.published_at ??
      item.approved_at ??
      item.ingested_at ??
      new Date().toISOString();
    return {
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
      created_at: scheduledReleaseAt,
    };
  });
  if (inserts.length > 0) {
    const { error: insertErr } = await supabase.from("posts").insert(inserts);
    if (insertErr) throw new Error(insertErr.message);
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
    const releaseAt = item.release_at ?? linkedPost.created_at;
    const { error: updateErr } = await supabase
      .from("news_items")
      .update({ shadow_post_id: linkedPost.id, release_at: releaseAt })
      .eq("id", item.id);
    if (updateErr) throw new Error(updateErr.message);
  }
}

async function removeNewsPosts(supabase: ReturnType<typeof adminClient>, newsItemIds: string[]) {
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

async function getAffectedNewsItemIds(
  supabase: ReturnType<typeof adminClient>,
  status: Status,
  reviewedBy: string,
  reviewedAt: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("news_items")
    .select("id")
    .eq("status", status)
    .eq("reviewed_by", reviewedBy)
    .eq("reviewed_at", reviewedAt);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "pending";
  const status: Status =
    statusParam === "published" || statusParam === "rejected" ? statusParam : "pending";

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("news_items")
    .select(
      "id, headline, source_name, source_url, canonical_url, summary, thumbnail_url, published_at, ingested_at, approved_at, release_at, tags, relevance_score, is_satire, status, created_at, reviewed_at"
    )
    .eq("status", status)
    .order(status === "pending" ? "relevance_score" : "created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

type ActionBody = {
  id?: string;
  ids?: string[];
  scope?: "all";
  status?: Status;
  action?: "approve" | "reject" | "delete";
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "delete") {
    return NextResponse.json({ error: "action must be 'approve' | 'reject' | 'delete'" }, { status: 400 });
  }

  const supabase = adminClient();

  // ── Hard delete ─────────────────────────────────────────────────────
  if (action === "delete") {
    let q = supabase.from("news_items").delete({ count: "exact" });
    if (body.ids && body.ids.length > 0) {
      q = q.in("id", body.ids);
    } else if (body.scope === "all" && body.status) {
      // Safety: refuse to wipe `published` via scope=all to avoid nuking the
      // live feed by accident. If you really mean it, pass explicit ids.
      if (body.status === "published") {
        return NextResponse.json(
          { error: "scope='all' delete is not allowed on 'published'. Pass ids explicitly." },
          { status: 400 }
        );
      }
      q = q.eq("status", body.status);
    } else {
      return NextResponse.json({ error: "delete requires ids[] or scope+status" }, { status: 400 });
    }
    const { error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  }

  // ── Status update (approve / reject) ────────────────────────────────
  const newStatus: Status = action === "approve" ? "published" : "rejected";
  const reviewedAt = new Date().toISOString();
  const patch =
    newStatus === "published"
      ? {
          status: newStatus,
          reviewed_at: reviewedAt,
          reviewed_by: auth.userId,
          approved_at: reviewedAt,
        }
      : {
          status: newStatus,
          reviewed_at: reviewedAt,
          reviewed_by: auth.userId,
          release_at: null,
        };

  // Single id (legacy shape).
  if (body.id) {
    const { error } = await supabase.from("news_items").update(patch).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      const affectedIds = await getAffectedNewsItemIds(supabase, newStatus, auth.userId, reviewedAt);
      if (newStatus === "published") {
        await ensurePublishedNewsPosts(supabase, affectedIds);
      } else {
        await removeNewsPosts(supabase, affectedIds);
      }
    } catch (syncErr) {
      return NextResponse.json(
        { error: `status updated but post sync failed: ${(syncErr as Error).message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, status: newStatus, updated: 1 });
  }

  // Bulk by id list.
  if (body.ids && body.ids.length > 0) {
    const { error, count } = await supabase
      .from("news_items")
      .update(patch, { count: "exact" })
      .in("id", body.ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      const affectedIds = await getAffectedNewsItemIds(supabase, newStatus, auth.userId, reviewedAt);
      if (newStatus === "published") {
        await ensurePublishedNewsPosts(supabase, affectedIds);
      } else {
        await removeNewsPosts(supabase, affectedIds);
      }
    } catch (syncErr) {
      return NextResponse.json(
        { error: `status updated but post sync failed: ${(syncErr as Error).message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, status: newStatus, updated: count ?? 0 });
  }

  // Bulk by scope (e.g. reject ALL pending).
  if (body.scope === "all" && body.status) {
    if (action === "approve" && body.status !== "pending") {
      return NextResponse.json(
        { error: "scope='all' approve is only allowed on 'pending'" },
        { status: 400 }
      );
    }
    const { error, count } = await supabase
      .from("news_items")
      .update(patch, { count: "exact" })
      .eq("status", body.status);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    try {
      const affectedIds = await getAffectedNewsItemIds(supabase, newStatus, auth.userId, reviewedAt);
      if (newStatus === "published") {
        await ensurePublishedNewsPosts(supabase, affectedIds);
      } else {
        await removeNewsPosts(supabase, affectedIds);
      }
    } catch (syncErr) {
      return NextResponse.json(
        { error: `status updated but post sync failed: ${(syncErr as Error).message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, status: newStatus, updated: count ?? 0 });
  }

  return NextResponse.json(
    { error: "Provide id, ids[], or scope+status with the action" },
    { status: 400 }
  );
}
