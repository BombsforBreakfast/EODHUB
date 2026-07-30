import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  CIRCUIT_CAPTION_MAX_LEN,
  CIRCUIT_MAX_MEDIA,
  CIRCUIT_SEND_RATE_LIMIT,
  CIRCUIT_SEND_RATE_WINDOW_MS,
  CIRCUIT_THOUGHT_MAX_LEN,
  CIRCUIT_TITLE_MAX_LEN,
  circuitExpiresAt,
  isCollapsingCircuitEnabled,
  canAccessCollapsingCircuit,
  mixCircuitStrip,
  type CircuitMediaDto,
  type CircuitPostDto,
  type CircuitPostType,
  type CircuitPromptDto,
} from "../../lib/circuit";
import type { PostAsMode } from "../../lib/postAsIdentity";
import { resolveOptionalAdminPostAsUserId } from "../../lib/server/resolveListingSharePostAsUserId";
import { checkRateLimit } from "../../lib/server/rateLimit";
import { fetchBlockedUserIds } from "../../lib/userBlocks";
import { hasFullPlatformAccess, type VerificationProfile } from "../../lib/verificationAccess";

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

async function requireUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const userClient = getUserClient(token);
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return null;
  return { user, userClient, token };
}

async function requireCircuitAccess(user: { id: string; email?: string | null }) {
  if (!canAccessCollapsingCircuit(user.email)) return null;

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
  return { admin, profile };
}

type MediaInput = {
  media_type: "image" | "video";
  public_url: string;
  storage_path?: string | null;
  poster_url?: string | null;
};

export async function GET(req: NextRequest) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireCircuitAccess(auth.user);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { admin } = access;
  const blocked = await fetchBlockedUserIds(admin, auth.user.id);
  const nowIso = new Date().toISOString();

  const [{ data: promptRows, error: promptError }, { data: postRows, error: postError }] =
    await Promise.all([
      admin
        .from("circuit_prompts")
        .select("id, slug, label, sort_hint")
        .eq("is_active", true)
        .order("sort_hint", { ascending: true }),
      admin
        .from("circuit_posts")
        .select("id, user_id, post_as_user_id, prompt_id, post_type, title, body, event_id, created_at, expires_at")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (promptError) return NextResponse.json({ error: promptError.message }, { status: 500 });
  if (postError) return NextResponse.json({ error: postError.message }, { status: 500 });

  const visiblePosts = (postRows ?? []).filter((row) => !blocked.has(row.user_id));
  const postIds = visiblePosts.map((p) => p.id);
  const authorIds = [
    ...new Set(
      visiblePosts.flatMap((p) => {
        const ids = [p.user_id];
        if (p.post_as_user_id) ids.push(p.post_as_user_id);
        return ids;
      }),
    ),
  ];
  const promptIds = [
    ...new Set(visiblePosts.map((p) => p.prompt_id).filter((id): id is string => !!id)),
  ];
  const eventIds = [
    ...new Set(visiblePosts.map((p) => p.event_id).filter((id): id is string => !!id)),
  ];

  const seenIds = new Set<string>();
  if (postIds.length > 0) {
    const { data: viewRows } = await admin
      .from("circuit_views")
      .select("post_id")
      .eq("user_id", auth.user.id)
      .in("post_id", postIds);
    for (const row of viewRows ?? []) {
      if (row.post_id) seenIds.add(row.post_id);
    }
  }

  const mediaByPost = new Map<string, CircuitMediaDto[]>();
  const commentCountByPost = new Map<string, number>();
  if (postIds.length > 0) {
    const [{ data: mediaRows, error: mediaError }, { data: commentRows }] = await Promise.all([
      admin
        .from("circuit_post_media")
        .select("id, post_id, sort_order, media_type, public_url, poster_url")
        .in("post_id", postIds)
        .order("sort_order", { ascending: true }),
      admin.from("circuit_comments").select("post_id").in("post_id", postIds),
    ]);
    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
    for (const m of mediaRows ?? []) {
      const list = mediaByPost.get(m.post_id) ?? [];
      list.push({
        id: m.id,
        sort_order: m.sort_order,
        media_type: m.media_type,
        public_url: m.public_url,
        poster_url: m.poster_url ?? null,
      });
      mediaByPost.set(m.post_id, list);
    }
    for (const c of commentRows ?? []) {
      if (!c.post_id) continue;
      commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1);
    }
  }

  const eventsById = new Map<
    string,
    {
      id: string;
      title: string;
      date: string;
      description: string | null;
      organization: string | null;
      signup_url: string | null;
      image_url: string | null;
      location: string | null;
      event_time: string | null;
    }
  >();
  const interestedByEvent = new Map<string, number>();
  const goingByEvent = new Map<string, number>();
  const myAttendanceByEvent = new Map<string, "interested" | "going">();
  const savedEventIds = new Set<string>();

  if (eventIds.length > 0) {
    const [{ data: eventRows }, { data: attendanceRows }, { data: savedRows }] = await Promise.all([
      admin
        .from("events")
        .select("id, title, date, description, organization, signup_url, image_url, location, event_time")
        .in("id", eventIds),
      admin.from("event_attendance").select("event_id, user_id, status").in("event_id", eventIds),
      admin
        .from("saved_events")
        .select("event_id")
        .eq("user_id", auth.user.id)
        .in("event_id", eventIds),
    ]);

    for (const e of eventRows ?? []) {
      eventsById.set(e.id, {
        id: e.id,
        title: e.title ?? "Untitled Event",
        date: e.date,
        description: e.description ?? null,
        organization: e.organization ?? null,
        signup_url: e.signup_url ?? null,
        image_url: e.image_url ?? null,
        location: e.location ?? null,
        event_time: e.event_time ?? null,
      });
    }

    for (const row of attendanceRows ?? []) {
      if (row.status === "interested") {
        interestedByEvent.set(row.event_id, (interestedByEvent.get(row.event_id) ?? 0) + 1);
      } else if (row.status === "going") {
        goingByEvent.set(row.event_id, (goingByEvent.get(row.event_id) ?? 0) + 1);
      }
      if (row.user_id === auth.user.id && (row.status === "interested" || row.status === "going")) {
        myAttendanceByEvent.set(row.event_id, row.status);
      }
    }
    for (const row of savedRows ?? []) {
      if (row.event_id) savedEventIds.add(row.event_id);
    }
  }

  const profilesById = new Map<
    string,
    {
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
    }
  >();
  if (authorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name, first_name, last_name, photo_url")
      .in("user_id", authorIds);
    for (const p of profiles ?? []) {
      profilesById.set(p.user_id, p);
    }
  }

  const promptLabelById = new Map<string, string>();
  for (const p of promptRows ?? []) {
    promptLabelById.set(p.id, p.label);
  }
  if (promptIds.length > 0) {
    const missing = promptIds.filter((id) => !promptLabelById.has(id));
    if (missing.length > 0) {
      const { data: extra } = await admin
        .from("circuit_prompts")
        .select("id, label")
        .in("id", missing);
      for (const p of extra ?? []) {
        promptLabelById.set(p.id, p.label);
      }
    }
  }

  const posts: CircuitPostDto[] = visiblePosts.map((row) => {
    const displayUserId = row.post_as_user_id ?? row.user_id;
    const p = profilesById.get(displayUserId);
    const name =
      p?.display_name?.trim() ||
      `${p?.first_name || ""} ${p?.last_name || ""}`.trim() ||
      "Member";
    const eventId = row.event_id ?? null;
    const event = eventId ? eventsById.get(eventId) ?? null : null;
    return {
      id: row.id,
      user_id: row.user_id,
      post_as_user_id: row.post_as_user_id ?? null,
      prompt_id: row.prompt_id,
      prompt_label: row.prompt_id ? (promptLabelById.get(row.prompt_id) ?? null) : null,
      post_type: row.post_type as CircuitPostType,
      title: row.title ?? event?.title ?? null,
      body: row.body,
      event_id: eventId,
      event,
      event_interested_count: eventId ? (interestedByEvent.get(eventId) ?? 0) : 0,
      event_going_count: eventId ? (goingByEvent.get(eventId) ?? 0) : 0,
      event_my_attendance: eventId ? (myAttendanceByEvent.get(eventId) ?? null) : null,
      event_saved: eventId ? savedEventIds.has(eventId) : false,
      created_at: row.created_at,
      expires_at: row.expires_at,
      author_name: name,
      author_photo_url: p?.photo_url ?? null,
      media: mediaByPost.get(row.id) ?? [],
      seen: seenIds.has(row.id),
      comment_count: commentCountByPost.get(row.id) ?? 0,
    };
  });

  const prompts: CircuitPromptDto[] = (promptRows ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    label: p.label,
    sort_hint: p.sort_hint,
  }));

  const items = mixCircuitStrip(posts, prompts, auth.user.id);
  return NextResponse.json({ items, posts, prompts });
}

export async function POST(req: NextRequest) {
  if (!isCollapsingCircuitEnabled()) {
    return NextResponse.json({ error: "Collapsing Circuit is not enabled." }, { status: 404 });
  }

  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await requireCircuitAccess(auth.user);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rate = checkRateLimit(`circuit-send:${auth.user.id}`, {
    limit: CIRCUIT_SEND_RATE_LIMIT,
    windowMs: CIRCUIT_SEND_RATE_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json({ error: "Slow down — try again in a minute." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as {
    post_type?: CircuitPostType;
    title?: string | null;
    body?: string | null;
    prompt_id?: string | null;
    media?: MediaInput[];
    postAsMode?: PostAsMode;
  } | null;

  if (!body || (body.post_type !== "media" && body.post_type !== "thought")) {
    return NextResponse.json({ error: "Invalid post_type." }, { status: 400 });
  }

  const postAsMode: PostAsMode | undefined =
    body.postAsMode === "admin" || body.postAsMode === "self" ? body.postAsMode : undefined;
  const postAsUserId = await resolveOptionalAdminPostAsUserId(access.admin, auth.user, postAsMode);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length > CIRCUIT_TITLE_MAX_LEN) {
    return NextResponse.json(
      { error: `Title must be ${CIRCUIT_TITLE_MAX_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (body.post_type === "thought") {
    if (!text) {
      return NextResponse.json({ error: "Thought cannot be empty." }, { status: 400 });
    }
    if (text.length > CIRCUIT_THOUGHT_MAX_LEN) {
      return NextResponse.json(
        { error: `Thought must be ${CIRCUIT_THOUGHT_MAX_LEN} characters or fewer.` },
        { status: 400 },
      );
    }
  } else if (text.length > CIRCUIT_CAPTION_MAX_LEN) {
    return NextResponse.json(
      { error: `Caption must be ${CIRCUIT_CAPTION_MAX_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  const media = Array.isArray(body.media) ? body.media : [];
  if (body.post_type === "media") {
    if (media.length < 1) {
      return NextResponse.json({ error: "Add at least one photo or video." }, { status: 400 });
    }
    if (media.length > CIRCUIT_MAX_MEDIA) {
      return NextResponse.json(
        { error: `Max ${CIRCUIT_MAX_MEDIA} photos/videos per Circuit post.` },
        { status: 400 },
      );
    }
    for (const m of media) {
      if (
        !m ||
        (m.media_type !== "image" && m.media_type !== "video") ||
        typeof m.public_url !== "string" ||
        !m.public_url.trim()
      ) {
        return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
      }
    }
  } else if (media.length > 0) {
    return NextResponse.json({ error: "Thought posts cannot include media." }, { status: 400 });
  }

  const { admin } = access;
  let promptId: string | null = null;
  if (body.prompt_id) {
    const { data: prompt } = await admin
      .from("circuit_prompts")
      .select("id")
      .eq("id", body.prompt_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!prompt) {
      return NextResponse.json({ error: "Unknown prompt." }, { status: 400 });
    }
    promptId = prompt.id;
  }

  const expiresAt = circuitExpiresAt().toISOString();
  const { data: post, error: insertError } = await admin
    .from("circuit_posts")
    .insert({
      user_id: auth.user.id,
      post_as_user_id: postAsUserId,
      prompt_id: promptId,
      post_type: body.post_type,
      title: title || null,
      body: text || null,
      expires_at: expiresAt,
    })
    .select("id, user_id, post_as_user_id, prompt_id, post_type, title, body, created_at, expires_at")
    .single();

  if (insertError || !post) {
    return NextResponse.json({ error: insertError?.message || "Could not create post." }, { status: 500 });
  }

  if (body.post_type === "media" && media.length > 0) {
    const rows = media.map((m, i) => ({
      post_id: post.id,
      sort_order: i,
      media_type: m.media_type,
      public_url: m.public_url.trim(),
      storage_path: m.storage_path ?? null,
      poster_url: m.poster_url ?? null,
    }));
    const { error: mediaError } = await admin.from("circuit_post_media").insert(rows);
    if (mediaError) {
      await admin.from("circuit_posts").delete().eq("id", post.id);
      return NextResponse.json({ error: mediaError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: post.id, expires_at: post.expires_at });
}
