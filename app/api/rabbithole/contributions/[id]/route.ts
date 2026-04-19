import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function resolveActor(token: string) {
  const userClient = getUserClient(token);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return {
    user,
    admin,
    isAdmin: !!profile?.is_admin,
  } as const;
}

type UpdatePayload = {
  title?: unknown;
  summary?: unknown;
  sourceUrl?: unknown;
  metadata?: unknown;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveActor(token);
  if ("error" in actor) return actor.error;

  const { id } = await params;
  const { data: contribution, error: lookupErr } = await actor.admin
    .from("rabbithole_contributions")
    .select("id, created_by, source_url")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!contribution) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = contribution.created_by === actor.user.id;
  if (!isAuthor && !actor.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as UpdatePayload | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const trimmed = body.title.trim();
    if (!trimmed) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    update.title = trimmed;
  }
  if (typeof body.summary === "string") {
    const trimmed = body.summary.trim();
    if (trimmed.length < 20) {
      return NextResponse.json({ error: "Summary must be at least 20 characters" }, { status: 400 });
    }
    update.summary = trimmed;
  }
  if (typeof body.sourceUrl === "string" || body.sourceUrl === null) {
    if (typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0) {
      try {
        const parsed = new URL(body.sourceUrl.trim());
        update.source_url = body.sourceUrl.trim();
        update.source_domain = parsed.hostname.toLowerCase();
      } catch {
        return NextResponse.json({ error: "Source URL is invalid" }, { status: 400 });
      }
    } else {
      update.source_url = null;
      update.source_domain = null;
    }
  }
  if (body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
    update.metadata = body.metadata;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data: updated, error: updErr } = await actor.admin
    .from("rabbithole_contributions")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, contributionId: updated.id });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = req.headers.get("Authorization");
  const token = auth?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actor = await resolveActor(token);
  if ("error" in actor) return actor.error;

  const { id } = await params;
  const { data: contribution, error: lookupErr } = await actor.admin
    .from("rabbithole_contributions")
    .select("id, created_by")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!contribution) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = contribution.created_by === actor.user.id;
  if (!isAuthor && !actor.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Best-effort storage cleanup before the row cascades. If the storage delete
  // fails we still proceed with the row delete; orphaned objects can be GC'd
  // later. Group object keys by bucket so we make one call per bucket.
  const { data: assets } = await actor.admin
    .from("rabbithole_assets")
    .select("bucket, object_key")
    .eq("contribution_id", id);

  if (assets && assets.length > 0) {
    const byBucket = new Map<string, string[]>();
    for (const a of assets as { bucket: string; object_key: string }[]) {
      const arr = byBucket.get(a.bucket) ?? [];
      arr.push(a.object_key);
      byBucket.set(a.bucket, arr);
    }
    await Promise.all(
      Array.from(byBucket.entries()).map(([bucket, keys]) =>
        actor.admin.storage.from(bucket).remove(keys).catch(() => null)
      )
    );
  }

  // Cascade FKs (tags, likes, comments, assets, posts.rabbithole_contribution_id)
  // are wired in earlier migrations.
  const { error: delErr } = await actor.admin
    .from("rabbithole_contributions")
    .delete()
    .eq("id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, removedBy: actor.isAdmin && !isAuthor ? "admin" : "author" });
}
