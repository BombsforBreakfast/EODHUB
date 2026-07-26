import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CIRCUIT_CAPTION_MAX_LEN,
  CIRCUIT_THOUGHT_MAX_LEN,
  CIRCUIT_TITLE_MAX_LEN,
  isCollapsingCircuitEnabled,
} from "../../../lib/circuit";
import { hasFullPlatformAccess, type VerificationProfile } from "../../../lib/verificationAccess";

function getUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireCircuitUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(
      "user_id, verification_status, account_type, email_verified, admin_verified, is_pure_admin, account_deleted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile || profile.account_deleted_at || !hasFullPlatformAccess(profile as VerificationProfile)) {
    return null;
  }
  return { user, admin };
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const access = await requireCircuitUser(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowIso = new Date().toISOString();
  const { data: post } = await access.admin
    .from("circuit_posts")
    .select("id, user_id, post_type, title, body, expires_at")
    .eq("id", id)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.user_id !== access.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (post.post_type === "event") {
    return NextResponse.json({ error: "Event tiles can’t be edited here." }, { status: 400 });
  }

  const payload = (await req.json().catch(() => null)) as {
    title?: string | null;
    body?: string | null;
  } | null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { title?: string | null; body?: string | null } = {};

  if ("title" in payload) {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    if (title.length > CIRCUIT_TITLE_MAX_LEN) {
      return NextResponse.json(
        { error: `Title must be ${CIRCUIT_TITLE_MAX_LEN} characters or fewer.` },
        { status: 400 },
      );
    }
    updates.title = title || null;
  }

  if ("body" in payload) {
    const text = typeof payload.body === "string" ? payload.body.trim() : "";
    if (post.post_type === "thought") {
      if (!text) {
        return NextResponse.json({ error: "Thought cannot be empty." }, { status: 400 });
      }
      if (text.length > CIRCUIT_THOUGHT_MAX_LEN) {
        return NextResponse.json(
          { error: `Thought must be ${CIRCUIT_THOUGHT_MAX_LEN} characters or fewer.` },
          { status: 400 },
        );
      }
      updates.body = text;
    } else {
      if (text.length > CIRCUIT_CAPTION_MAX_LEN) {
        return NextResponse.json(
          { error: `Caption must be ${CIRCUIT_CAPTION_MAX_LEN} characters or fewer.` },
          { status: 400 },
        );
      }
      updates.body = text || null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data: updated, error } = await access.admin
    .from("circuit_posts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", access.user.id)
    .select("id, title, body")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || "Could not update." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, post: updated });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const { id } = await ctx.params;
  const access = await requireCircuitUser(req);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: post } = await access.admin
    .from("circuit_posts")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (post.user_id !== access.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await access.admin.from("circuit_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
