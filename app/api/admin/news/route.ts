import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensurePublishedNewsPosts, removeNewsPosts } from "@/app/lib/news/publishApprovedNews";

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
      "id, headline, source_name, source_url, canonical_url, summary, thumbnail_url, admin_manual_image_url, published_at, ingested_at, approved_at, release_at, tags, relevance_score, is_satire, status, created_at, reviewed_at, raw_payload"
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
  admin_manual_image_url?: string | null;
};

type PatchBody = {
  id?: string;
  admin_manual_image_url?: string | null;
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
    const admin_manual_image_url =
      typeof body.admin_manual_image_url === "string"
        ? body.admin_manual_image_url.trim() || null
        : body.admin_manual_image_url === null
          ? null
          : undefined;
    const singlePatch = admin_manual_image_url !== undefined ? { ...patch, admin_manual_image_url } : patch;
    const { error } = await supabase.from("news_items").update(singlePatch).eq("id", body.id);
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

async function syncNewsShadowPostImage(
  supabase: ReturnType<typeof adminClient>,
  newsItemId: string,
  adminManualImageUrl: string | null,
  thumbnailUrl: string | null,
) {
  const ogImage = adminManualImageUrl ?? thumbnailUrl;
  const { error } = await supabase
    .from("posts")
    .update({ og_image: ogImage })
    .eq("news_item_id", newsItemId);
  if (error) throw new Error(error.message);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin_manual_image_url =
    typeof body.admin_manual_image_url === "string"
      ? body.admin_manual_image_url.trim() || null
      : body.admin_manual_image_url === null
        ? null
        : undefined;

  if (admin_manual_image_url === undefined) {
    return NextResponse.json({ error: "admin_manual_image_url must be string or null" }, { status: 400 });
  }

  const supabase = adminClient();
  const { data: row, error: rowErr } = await supabase
    .from("news_items")
    .select("id, status, thumbnail_url")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "News item not found" }, { status: 404 });

  const { error: newsErr } = await supabase
    .from("news_items")
    .update({ admin_manual_image_url })
    .eq("id", id);
  if (newsErr) return NextResponse.json({ error: newsErr.message }, { status: 500 });

  if ((row as { status: string }).status === "published") {
    try {
      await syncNewsShadowPostImage(
        supabase,
        id,
        admin_manual_image_url,
        (row as { thumbnail_url: string | null }).thumbnail_url,
      );
    } catch (syncErr) {
      return NextResponse.json(
        { error: `Image saved but feed post sync failed: ${(syncErr as Error).message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, id, admin_manual_image_url });
}
