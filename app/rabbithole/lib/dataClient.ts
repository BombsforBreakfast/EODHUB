"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  IsolatedComment,
  IsolatedPost,
  RabbitholeAsset,
  RabbitholeContentType,
  RabbitholeContribution,
  RabbitholeContributionComment,
  RabbitholeReply,
  RabbitholeThread,
  RabbitholeTopic,
} from "./types";
import {
  aggregatesBySubjectId,
  buildReactorDisplayNamesByTypeForSubject,
  emptyAggregate,
  fetchContentReactionsForSubjects,
} from "../../lib/reactions";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function mapTopicRow(row: any): RabbitholeTopic {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    subtopics: [],
    tags: [],
  };
}

function mapContributionAssetRow(row: any): RabbitholeAsset {
  return {
    id: row.id,
    contributionId: row.contribution_id,
    storageProvider: row.storage_provider,
    bucket: row.bucket,
    objectKey: row.object_key,
    originalFilename: row.original_filename ?? null,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    checksumSha256: row.checksum_sha256 ?? null,
    uploadedBy: row.uploaded_by,
    accessLevel: row.access_level ?? "private",
    status: row.status ?? "ready",
    isPrimary: !!row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Coexistence rule: a feed post can independently be sent to Kangaroo Court AND promoted to
 * Rabbithole, in either order. Neither action blocks the other. The thread stores
 * `promoted_from_post_id` so the thread detail page can fetch the live KC verdict for
 * that post at render time — meaning a verdict issued after promotion is always reflected.
 */
function mapThreadRow(row: any): RabbitholeThread {
  const topic = Array.isArray(row.rabbithole_topics) ? row.rabbithole_topics[0] : row.rabbithole_topics;
  const subtopic = Array.isArray(row.rabbithole_subtopics) ? row.rabbithole_subtopics[0] : row.rabbithole_subtopics;
  const threadTags = Array.isArray(row.rabbithole_thread_tags) ? row.rabbithole_thread_tags : [];
  const tags = threadTags
    .map((item: any) => {
      const tagRow = Array.isArray(item.rabbithole_tags) ? item.rabbithole_tags[0] : item.rabbithole_tags;
      return tagRow?.name as string | undefined;
    })
    .filter(Boolean) as string[];

  return {
    id: row.id,
    title: row.title,
    curatorNote: row.body ?? null,
    topicSlug: topic?.slug ?? "unknown",
    topicName: topic?.name ?? "Unknown Topic",
    subtopic: subtopic?.name ?? row.subtopic_custom ?? undefined,
    tags,
    author: row.author_id,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    replyCount: row.reply_count ?? 0,
    isHighValue: row.is_high_value ?? false,
    sourceType: (row.source_type as "feed" | "unit") ?? "feed",
    promotedFromPostId: row.promoted_from_post_id ?? null,
    promotedFromUnitPostId: row.promoted_from_unit_post_id ?? null,
  };
}

const THREAD_SELECT = `
  id, title, body, author_id, created_at, last_activity_at, reply_count, is_high_value,
  subtopic_custom, source_type, promoted_from_post_id, promoted_from_unit_post_id,
  rabbithole_topics!inner(slug, name),
  rabbithole_subtopics(name),
  rabbithole_thread_tags(rabbithole_tags(name, slug))
`;

export async function fetchRabbitholeTopics(supabase: SupabaseClient): Promise<RabbitholeTopic[]> {
  const { data, error } = await supabase
    .from("rabbithole_topics")
    .select("id, slug, name, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !data) return [];

  const topics = (data as any[]).map(mapTopicRow);
  const topicIds = (data as any[]).map((row) => row.id);
  const [subtopicsRes, tagsRes] = await Promise.all([
    supabase
      .from("rabbithole_subtopics")
      .select("topic_id, name")
      .in("topic_id", topicIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("rabbithole_threads")
      .select("topic_id, rabbithole_thread_tags(rabbithole_tags(name))")
      .in("topic_id", topicIds)
      .limit(200),
  ]);

  const topicById = new Map<string, RabbitholeTopic>();
  (data as any[]).forEach((row, idx) => topicById.set(row.id, topics[idx]));

  (subtopicsRes.data ?? []).forEach((row: any) => {
    const topic = topicById.get(row.topic_id);
    if (topic && !topic.subtopics.includes(row.name)) topic.subtopics.push(row.name);
  });

  (tagsRes.data ?? []).forEach((row: any) => {
    const topic = topicById.get(row.topic_id);
    if (!topic) return;
    const threadTags = Array.isArray(row.rabbithole_thread_tags) ? row.rabbithole_thread_tags : [];
    threadTags.forEach((item: any) => {
      const tagRow = Array.isArray(item.rabbithole_tags) ? item.rabbithole_tags[0] : item.rabbithole_tags;
      const tagName = tagRow?.name as string | undefined;
      if (tagName && !topic.tags.includes(tagName)) topic.tags.push(tagName);
    });
  });

  return topics;
}

/**
 * User-extensible category library: lets a contributor add a new RabbitHole
 * topic from inside the contribute modal. We slugify the input and look up
 * an existing topic first (matching by slug or case-insensitive name) so the
 * "Other" path is also self-healing if someone re-types an existing label.
 *
 * New topics are written with sort_order = 999 so curated topics stay at the
 * top; the matching RLS update policy enforces sort_order >= 900 for owners
 * to prevent client-side bumping above the curated set.
 */
export async function createRabbitholeTopic(
  supabase: SupabaseClient,
  rawName: string,
): Promise<{ ok: boolean; topic?: RabbitholeTopic; error?: string }> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: "Category name is required." };
  if (name.length > 60) return { ok: false, error: "Category name is too long (max 60 characters)." };

  const slug = normalize(name).replace(/\s+/g, "-").slice(0, 60);
  if (!slug) return { ok: false, error: "Category name must contain letters or numbers." };

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in to add a category." };

  const { data: existingBySlug } = await supabase
    .from("rabbithole_topics")
    .select("id, slug, name, description")
    .eq("slug", slug)
    .maybeSingle();
  if (existingBySlug) return { ok: true, topic: mapTopicRow(existingBySlug) };

  const { data: existingByName } = await supabase
    .from("rabbithole_topics")
    .select("id, slug, name, description")
    .ilike("name", name)
    .maybeSingle();
  if (existingByName) return { ok: true, topic: mapTopicRow(existingByName) };

  const { data: created, error: insertErr } = await supabase
    .from("rabbithole_topics")
    .insert({
      slug,
      name,
      is_active: true,
      sort_order: 999,
      created_by: userId,
    })
    .select("id, slug, name, description")
    .maybeSingle();

  if (insertErr || !created) {
    // Race window: another writer may have just inserted the same slug/name.
    // Try a final lookup so the caller still gets a usable topic instead of
    // a hard error message.
    const { data: raceWinner } = await supabase
      .from("rabbithole_topics")
      .select("id, slug, name, description")
      .or(`slug.eq.${slug},name.ilike.${name}`)
      .maybeSingle();
    if (raceWinner) return { ok: true, topic: mapTopicRow(raceWinner) };
    return { ok: false, error: insertErr?.message || "Could not add category." };
  }

  return { ok: true, topic: mapTopicRow(created) };
}

export async function fetchRabbitholeThreads(
  supabase: SupabaseClient,
  options?: { topicSlug?: string; limit?: number },
): Promise<RabbitholeThread[]> {
  let query = supabase
    .from("rabbithole_threads")
    .select(THREAD_SELECT)
    .eq("status", "active")
    .order("last_activity_at", { ascending: false })
    .limit(options?.limit ?? 60);

  if (options?.topicSlug) query = query.eq("rabbithole_topics.slug", options.topicSlug);

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as any[]).map(mapThreadRow);
}

export async function searchRabbitholeThreads(
  supabase: SupabaseClient,
  rawQuery: string,
  limit = 40,
): Promise<RabbitholeThread[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const normalizedQuery = normalize(q);
  const expandedTerms = new Set<string>([normalizedQuery]);

  const [aliasRes, tagsRes] = await Promise.all([
    supabase
      .from("rabbithole_tag_aliases")
      .select("tag_id, alias_text, normalized_alias")
      .or(`alias_text.ilike.%${q}%,normalized_alias.ilike.%${normalizedQuery}%`)
      .limit(30),
    supabase
      .from("rabbithole_tags")
      .select("id, name, slug")
      .or(`name.ilike.%${q}%,slug.ilike.%${normalizedQuery}%`)
      .limit(30),
  ]);

  const matchedTagIds = new Set<string>();
  (aliasRes.data ?? []).forEach((row: any) => {
    if (row.tag_id) matchedTagIds.add(row.tag_id);
    if (row.normalized_alias) expandedTerms.add(normalize(row.normalized_alias));
  });
  (tagsRes.data ?? []).forEach((row: any) => {
    if (row.id) matchedTagIds.add(row.id);
    if (row.name) expandedTerms.add(normalize(row.name));
    if (row.slug) expandedTerms.add(normalize(row.slug));
  });

  const [textRes, tagThreadRes] = await Promise.all([
    supabase
      .from("rabbithole_threads")
      .select(THREAD_SELECT)
      .eq("status", "active")
      .or(`title.ilike.%${q}%,body.ilike.%${q}%,subtopic_custom.ilike.%${q}%`)
      .order("last_activity_at", { ascending: false })
      .limit(limit),
    matchedTagIds.size > 0
      ? supabase.from("rabbithole_thread_tags").select("thread_id").in("tag_id", Array.from(matchedTagIds)).limit(limit)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const byId = new Map<string, RabbitholeThread>();
  (textRes.data ?? []).forEach((row: any) => {
    const mapped = mapThreadRow(row);
    byId.set(mapped.id, mapped);
  });

  const idsFromTags = Array.from(new Set((tagThreadRes.data ?? []).map((row: any) => row.thread_id).filter(Boolean)));
  if (idsFromTags.length > 0) {
    const { data: taggedThreads } = await supabase
      .from("rabbithole_threads")
      .select(THREAD_SELECT)
      .eq("status", "active")
      .in("id", idsFromTags)
      .limit(limit);

    (taggedThreads ?? []).forEach((row: any) => {
      const mapped = mapThreadRow(row);
      byId.set(mapped.id, mapped);
    });
  }

  const all = Array.from(byId.values());
  if (all.length > 0) {
    return all
      .map((thread) => {
        let score = 0;
        const pool = [thread.title, thread.curatorNote ?? "", thread.subtopic ?? "", ...thread.tags, thread.topicSlug].map(normalize).join(" ");
        const normalizedTags = thread.tags.map(normalize);
        expandedTerms.forEach((term) => {
          if (!term) return;
          if (pool.includes(term)) score += 1;
          if (normalize(thread.title).includes(term)) score += 2;
          if (normalizedTags.some((tag) => tag === term)) score += 6;
          else if (normalizedTags.some((tag) => tag.includes(term))) score += 3;
        });
        return { thread, score };
      })
      .sort((a, b) => (b.score - a.score) || b.thread.lastActivityAt.localeCompare(a.thread.lastActivityAt))
      .slice(0, limit)
      .map((item) => item.thread);
  }

  return [];
}

export async function fetchRabbitholeThreadDetail(
  supabase: SupabaseClient,
  threadId: string,
): Promise<{ thread: RabbitholeThread | null; replies: RabbitholeReply[] }> {
  const { data, error } = await supabase
    .from("rabbithole_threads")
    .select(THREAD_SELECT)
    .eq("id", threadId)
    .maybeSingle();

  const { data: repliesData } = await supabase
    .from("rabbithole_replies")
    .select("id, thread_id, author_id, body, created_at")
    .eq("thread_id", threadId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error || !data) return { thread: null, replies: [] };

  return {
    thread: mapThreadRow(data),
    replies: (repliesData ?? []).map((row: any) => ({
      id: row.id,
      threadId: row.thread_id,
      author: row.author_id,
      body: row.body,
      createdAt: row.created_at,
    })),
  };
}

/** Fetch all data needed to render an isolated feed post in the Rabbithole detail view. */
export async function fetchIsolatedFeedPost(
  supabase: SupabaseClient,
  postId: string,
  viewerUserId: string | null,
): Promise<{ post: IsolatedPost | null; comments: IsolatedComment[] }> {
  const [postRes, commentRes] = await Promise.all([
    supabase
      .from("posts")
      .select("id, content, image_url, gif_url, og_title, og_description, og_image, og_url, created_at, user_id")
      .eq("id", postId)
      .maybeSingle(),
    supabase
      .from("post_comments")
      .select("id, content, created_at, user_id, image_url, gif_url")
      .eq("post_id", postId)
      .or("hidden_for_review.is.null,hidden_for_review.eq.false")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (!postRes.data) return { post: null, comments: [] };

  let reactionRows: { subject_id: string; user_id: string; reaction_type: string }[] = [];
  try {
    reactionRows = await fetchContentReactionsForSubjects(supabase, "post", [postId]);
  } catch {
    reactionRows = [];
  }
  const aggMap = aggregatesBySubjectId(reactionRows, viewerUserId);
  const agg = aggMap.get(postId) ?? emptyAggregate();
  const row = postRes.data as any;

  const reactorIds = [...new Set(reactionRows.map((r) => r.user_id))];
  const reactorNameMap = new Map<string, string>();
  if (reactorIds.length > 0) {
    const { data: reactorProfiles } = await supabase
      .from("profiles")
      .select("user_id, display_name, first_name, last_name")
      .in("user_id", reactorIds);
    for (const p of (reactorProfiles ?? []) as {
      user_id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }[]) {
      reactorNameMap.set(
        p.user_id,
        (p.display_name?.trim() || null) ||
          `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
          "Member",
      );
    }
  }
  const reactorNamesByType = buildReactorDisplayNamesByTypeForSubject(reactionRows, postId, reactorNameMap);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, photo_url")
    .eq("user_id", row.user_id)
    .maybeSingle();

  const authorName =
    (profileRow as any)?.display_name ||
    `${(profileRow as any)?.first_name ?? ""} ${(profileRow as any)?.last_name ?? ""}`.trim() ||
    "Member";

  const commentRows = (commentRes.data ?? []) as any[];
  const commentAuthorIds = [...new Set(commentRows.map((c: any) => c.user_id))];
  let commentProfiles: Record<string, any> = {};
  if (commentAuthorIds.length > 0) {
    const { data: cProfiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", commentAuthorIds);
    for (const p of cProfiles ?? []) {
      commentProfiles[p.user_id] = p;
    }
  }

  const comments: IsolatedComment[] = commentRows.map((c: any) => {
    const cp = commentProfiles[c.user_id];
    const name = cp?.display_name || `${cp?.first_name ?? ""} ${cp?.last_name ?? ""}`.trim() || "Member";
    return {
      id: c.id,
      content: c.content ?? "",
      createdAt: c.created_at,
      authorName: name,
      authorPhoto: cp?.photo_url ?? null,
      imageUrl: c.image_url ?? null,
      gifUrl: c.gif_url ?? null,
    };
  });

  const post: IsolatedPost = {
    id: row.id,
    content: row.content ?? null,
    imageUrl: row.image_url ?? null,
    gifUrl: row.gif_url ?? null,
    ogTitle: row.og_title ?? null,
    ogDescription: row.og_description ?? null,
    ogImageUrl: row.og_image ?? null,
    ogUrl: row.og_url ?? null,
    createdAt: row.created_at,
    author: { id: row.user_id, name: authorName, photoUrl: (profileRow as any)?.photo_url ?? null },
    likeCount: agg.totalCount,
    myReaction: agg.myReaction,
    reactionCountsByType: agg.countsByType,
    reactorNamesByType,
    commentCount: commentRows.length,
    sourceType: "feed",
  };

  return { post, comments };
}

/** Fetch all data needed to render an isolated unit post in the Rabbithole detail view. */
export async function fetchIsolatedUnitPost(
  supabase: SupabaseClient,
  unitPostId: string,
  viewerUserId: string | null,
): Promise<{ post: IsolatedPost | null; comments: IsolatedComment[] }> {
  const [postRes, likeRes, viewerLikeRes, commentRes] = await Promise.all([
    supabase
      .from("unit_posts")
      .select("id, content, photo_url, gif_url, created_at, user_id, unit_id")
      .eq("id", unitPostId)
      .maybeSingle(),
    supabase
      .from("unit_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("unit_post_id", unitPostId),
    viewerUserId
      ? supabase.from("unit_post_likes").select("id").eq("unit_post_id", unitPostId).eq("user_id", viewerUserId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("unit_post_comments")
      .select("id, content, created_at, user_id, image_url, gif_url")
      .eq("unit_post_id", unitPostId)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  if (!postRes.data) return { post: null, comments: [] };
  const row = postRes.data as any;

  const [profileRes, unitRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .eq("user_id", row.user_id)
      .maybeSingle(),
    supabase
      .from("units")
      .select("name, slug")
      .eq("id", row.unit_id)
      .maybeSingle(),
  ]);

  const profileRow = profileRes.data as any;
  const unitRow = unitRes.data as any;
  const authorName =
    profileRow?.display_name ||
    `${profileRow?.first_name ?? ""} ${profileRow?.last_name ?? ""}`.trim() ||
    "Member";

  const commentRows = (commentRes.data ?? []) as any[];
  const commentAuthorIds = [...new Set(commentRows.map((c: any) => c.user_id))];
  let commentProfiles: Record<string, any> = {};
  if (commentAuthorIds.length > 0) {
    const { data: cProfiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", commentAuthorIds);
    for (const p of cProfiles ?? []) {
      commentProfiles[p.user_id] = p;
    }
  }

  const comments: IsolatedComment[] = commentRows.map((c: any) => {
    const cp = commentProfiles[c.user_id];
    const name = cp?.display_name || `${cp?.first_name ?? ""} ${cp?.last_name ?? ""}`.trim() || "Member";
    return {
      id: c.id,
      content: c.content ?? "",
      createdAt: c.created_at,
      authorName: name,
      authorPhoto: cp?.photo_url ?? null,
      imageUrl: c.image_url ?? null,
      gifUrl: c.gif_url ?? null,
    };
  });

  const post: IsolatedPost = {
    id: row.id,
    content: row.content ?? null,
    imageUrl: row.photo_url ?? null,
    gifUrl: row.gif_url ?? null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    ogUrl: null,
    createdAt: row.created_at,
    author: { id: row.user_id, name: authorName, photoUrl: profileRow?.photo_url ?? null },
    likeCount: (likeRes as any).count ?? 0,
    viewerLiked: !!(viewerLikeRes as any).data,
    commentCount: commentRows.length,
    sourceType: "unit",
    unitName: unitRow?.name ?? null,
    unitSlug: unitRow?.slug ?? null,
  };

  return { post, comments };
}

async function resolveAndAttachTags(
  supabase: SupabaseClient,
  threadId: string,
  tags: string[],
  userId: string,
): Promise<void> {
  const cleanedTags = Array.from(
    new Map(
      tags.map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase().trim(), t])
    ).values()
  );

  const tagIds: string[] = [];
  for (const tag of cleanedTags) {
    const normalizedName = tag.toLowerCase().trim();
    const slug = normalize(tag).replace(/\s+/g, "-");
    let tagId: string | null = null;

    const { data: existing } = await supabase
      .from("rabbithole_tags")
      .select("id")
      .eq("normalized_name", normalizedName)
      .maybeSingle();

    if (existing?.id) {
      tagId = existing.id;
    } else {
      const { data: created } = await supabase
        .from("rabbithole_tags")
        .insert({ name: tag, slug, normalized_name: normalizedName, created_by: userId })
        .select("id")
        .maybeSingle();
      if (created?.id) tagId = created.id;
    }

    if (tagId) tagIds.push(tagId);
  }

  if (tagIds.length > 0) {
    await supabase.from("rabbithole_thread_tags").insert(
      tagIds.map((tagId) => ({ thread_id: threadId, tag_id: tagId }))
    );
  }
}

/** Promote a main-feed post to Rabbithole. */
export async function promotePostToRabbithole(
  supabase: SupabaseClient,
  input: { postId: string; title: string; curatorNote: string; topicSlug: string; tags: string[] },
): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const { data: topicRow, error: topicErr } = await supabase
    .from("rabbithole_topics")
    .select("id")
    .eq("slug", input.topicSlug)
    .maybeSingle();
  if (topicErr || !topicRow?.id) return { ok: false, error: "Topic not found." };

  // If the promoted post carries a linked article (og_url) — either a
  // user-shared link or a RUMINT news shadow post — capture it on the thread
  // so the article URL is first-class, not just implicit via the promoted
  // post.
  const { data: postRow } = await supabase
    .from("posts")
    .select("og_url")
    .eq("id", input.postId)
    .maybeSingle();
  let sourceUrl: string | null = null;
  let sourceDomain: string | null = null;
  const ogUrl = (postRow as { og_url?: string | null } | null)?.og_url?.trim();
  if (ogUrl) {
    try {
      const parsed = new URL(ogUrl);
      sourceUrl = ogUrl;
      sourceDomain = parsed.hostname.toLowerCase();
    } catch {
      // og_url is malformed on the post; skip source attribution.
      sourceUrl = null;
    }
  }

  const insertPayload: Record<string, unknown> = {
    title: input.title.trim(),
    body: input.curatorNote.trim() || null,
    topic_id: topicRow.id,
    author_id: userId,
    source_type: "feed",
    promoted_from_post_id: input.postId,
    status: "active",
    last_activity_at: new Date().toISOString(),
  };
  if (sourceUrl) {
    insertPayload.source_url = sourceUrl;
    insertPayload.source_domain = sourceDomain;
  }

  let insertResult = await supabase
    .from("rabbithole_threads")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();
  // Fallback if source_url/source_domain columns haven't been migrated yet.
  if (
    insertResult.error &&
    sourceUrl &&
    /source_url|source_domain/.test(insertResult.error.message ?? "")
  ) {
    delete insertPayload.source_url;
    delete insertPayload.source_domain;
    insertResult = await supabase
      .from("rabbithole_threads")
      .insert(insertPayload)
      .select("id")
      .maybeSingle();
  }
  const { data: insertData, error: insertErr } = insertResult;
  if (insertErr || !insertData?.id) return { ok: false, error: "Could not create Rabbithole thread." };

  if (input.tags.length > 0) {
    await resolveAndAttachTags(supabase, insertData.id, input.tags, userId);
  }

  await supabase
    .from("posts")
    .update({ rabbithole_thread_id: insertData.id })
    .eq("id", input.postId);

  return { ok: true, threadId: insertData.id };
}

/** Promote a unit/group forum post to Rabbithole. */
export async function promoteUnitPostToRabbithole(
  supabase: SupabaseClient,
  input: { unitPostId: string; title: string; curatorNote: string; topicSlug: string; tags: string[] },
): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const { data: topicRow, error: topicErr } = await supabase
    .from("rabbithole_topics")
    .select("id")
    .eq("slug", input.topicSlug)
    .maybeSingle();
  if (topicErr || !topicRow?.id) return { ok: false, error: "Topic not found." };

  const { data: insertData, error: insertErr } = await supabase
    .from("rabbithole_threads")
    .insert({
      title: input.title.trim(),
      body: input.curatorNote.trim() || null,
      topic_id: topicRow.id,
      author_id: userId,
      source_type: "unit",
      promoted_from_unit_post_id: input.unitPostId,
      status: "active",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !insertData?.id) return { ok: false, error: "Could not create Rabbithole thread." };

  if (input.tags.length > 0) {
    await resolveAndAttachTags(supabase, insertData.id, input.tags, userId);
  }

  await supabase
    .from("unit_posts")
    .update({ rabbithole_thread_id: insertData.id })
    .eq("id", input.unitPostId);

  return { ok: true, threadId: insertData.id };
}

/** @deprecated Manual thread creation is phased out. All Rabbithole content comes from promoted posts. */
export async function createRabbitholeReply(
  supabase: SupabaseClient,
  input: { threadId: string; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const { error } = await supabase.from("rabbithole_replies").insert({
    thread_id: input.threadId,
    body: input.body.trim(),
    author_id: userId,
  });
  if (error) return { ok: false, error: "Could not post reply." };

  const { data: threadRow } = await supabase
    .from("rabbithole_threads")
    .select("reply_count")
    .eq("id", input.threadId)
    .maybeSingle();
  const nextReplyCount = (threadRow?.reply_count ?? 0) + 1;
  await supabase
    .from("rabbithole_threads")
    .update({ last_activity_at: new Date().toISOString(), reply_count: nextReplyCount })
    .eq("id", input.threadId);

  return { ok: true };
}

const CONTRIBUTION_SELECT = `
  id, title, summary, content_type, source_url, source_domain, metadata,
  created_at, updated_at, last_activity_at, created_by, category_id,
  rabbithole_topics!inner(slug, name),
  rabbithole_contribution_tags(rabbithole_tags(name))
`;

function mapContributionRow(row: any): RabbitholeContribution {
  const topic = Array.isArray(row.rabbithole_topics) ? row.rabbithole_topics[0] : row.rabbithole_topics;
  const tagRows = Array.isArray(row.rabbithole_contribution_tags) ? row.rabbithole_contribution_tags : [];
  const tags = tagRows
    .map((item: any) => {
      const tag = Array.isArray(item.rabbithole_tags) ? item.rabbithole_tags[0] : item.rabbithole_tags;
      return tag?.name as string | undefined;
    })
    .filter(Boolean) as string[];

  return {
    id: row.id,
    title: row.title ?? "",
    summary: row.summary ?? "",
    contentType: (row.content_type as RabbitholeContentType) ?? "resource",
    categorySlug: topic?.slug ?? "unknown",
    categoryName: topic?.name ?? "Unknown",
    tags,
    sourceUrl: row.source_url ?? null,
    sourceDomain: row.source_domain ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at ?? row.created_at,
    createdBy: row.created_by,
    likeCount: 0,
    commentCount: 0,
    viewerLiked: false,
  };
}

export async function fetchRabbitholeContributions(
  supabase: SupabaseClient,
  options?: {
    limit?: number;
    categorySlug?: string;
    contentType?: RabbitholeContentType | "";
    viewerUserId?: string | null;
  },
): Promise<RabbitholeContribution[]> {
  let query = supabase
    .from("rabbithole_contributions")
    .select(CONTRIBUTION_SELECT)
    .eq("status", "active")
    .order("last_activity_at", { ascending: false })
    .limit(options?.limit ?? 120);

  if (options?.categorySlug) query = query.eq("rabbithole_topics.slug", options.categorySlug);
  if (options?.contentType) query = query.eq("content_type", options.contentType);

  const { data, error } = await query;
  if (error || !data) return [];

  const base = (data as any[]).map(mapContributionRow);
  const ids = base.map((item) => item.id);
  if (ids.length === 0) return base;

  const [likesRes, commentsRes, viewerLikesRes] = await Promise.all([
    supabase
      .from("rabbithole_contribution_likes")
      .select("contribution_id")
      .in("contribution_id", ids),
    supabase
      .from("rabbithole_contribution_comments")
      .select("contribution_id")
      .in("contribution_id", ids)
      .is("deleted_at", null),
    options?.viewerUserId
      ? supabase
          .from("rabbithole_contribution_likes")
          .select("contribution_id")
          .eq("user_id", options.viewerUserId)
          .in("contribution_id", ids)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const likeCountById = new Map<string, number>();
  (likesRes.data ?? []).forEach((row: any) => {
    likeCountById.set(row.contribution_id, (likeCountById.get(row.contribution_id) ?? 0) + 1);
  });

  const commentCountById = new Map<string, number>();
  (commentsRes.data ?? []).forEach((row: any) => {
    commentCountById.set(row.contribution_id, (commentCountById.get(row.contribution_id) ?? 0) + 1);
  });

  const viewerLikedSet = new Set<string>((viewerLikesRes.data ?? []).map((row: any) => row.contribution_id));

  return base.map((item) => ({
    ...item,
    likeCount: likeCountById.get(item.id) ?? 0,
    commentCount: commentCountById.get(item.id) ?? 0,
    viewerLiked: viewerLikedSet.has(item.id),
  }));
}

export async function createRabbitholeContribution(
  supabase: SupabaseClient,
  input: {
    title: string;
    summary: string;
    categorySlug: string;
    contentType: RabbitholeContentType;
    tags: string[];
    sourceUrl?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; contributionId?: string; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const { data: topicRow, error: topicErr } = await supabase
    .from("rabbithole_topics")
    .select("id")
    .eq("slug", input.categorySlug)
    .maybeSingle();
  if (topicErr || !topicRow?.id) return { ok: false, error: "Category not found." };

  let sourceDomain: string | null = null;
  if (input.sourceUrl) {
    try {
      const parsed = new URL(input.sourceUrl);
      sourceDomain = parsed.hostname.toLowerCase();
    } catch {
      return { ok: false, error: "Source URL is invalid." };
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from("rabbithole_contributions")
    .insert({
      title: input.title.trim(),
      summary: input.summary.trim(),
      content_type: input.contentType,
      category_id: topicRow.id,
      source_url: input.sourceUrl?.trim() || null,
      source_domain: sourceDomain,
      metadata: input.metadata ?? {},
      created_by: userId,
      status: "active",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (insertErr || !created?.id) return { ok: false, error: "Could not create contribution." };

  if (input.tags.length > 0) {
    const cleanedTags = Array.from(
      new Map(
        input.tags.map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase().trim(), t])
      ).values()
    );

    const tagIds: string[] = [];
    for (const tag of cleanedTags) {
      const normalizedName = tag.toLowerCase().trim();
      const slug = normalize(tag).replace(/\s+/g, "-");
      let tagId: string | null = null;

      const { data: existing } = await supabase
        .from("rabbithole_tags")
        .select("id")
        .eq("normalized_name", normalizedName)
        .maybeSingle();

      if (existing?.id) {
        tagId = existing.id;
      } else {
        const { data: newTag } = await supabase
          .from("rabbithole_tags")
          .insert({ name: tag, slug, normalized_name: normalizedName, created_by: userId })
          .select("id")
          .maybeSingle();
        if (newTag?.id) tagId = newTag.id;
      }

      if (tagId) tagIds.push(tagId);
    }

    if (tagIds.length > 0) {
      await supabase.from("rabbithole_contribution_tags").insert(
        tagIds.map((tagId) => ({
          contribution_id: created.id,
          tag_id: tagId,
        }))
      );
    }
  }

  return { ok: true, contributionId: created.id };
}

export async function fetchRabbitholeContributionDetail(
  supabase: SupabaseClient,
  contributionId: string,
  viewerUserId: string | null,
): Promise<{
  contribution: RabbitholeContribution | null;
  comments: RabbitholeContributionComment[];
  assets: RabbitholeAsset[];
}> {
  const { data, error } = await supabase
    .from("rabbithole_contributions")
    .select(CONTRIBUTION_SELECT)
    .eq("id", contributionId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return { contribution: null, comments: [], assets: [] };

  const contribution = mapContributionRow(data);

  const [likesRes, viewerLikeRes, commentRes, assetRes] = await Promise.all([
    supabase
      .from("rabbithole_contribution_likes")
      .select("id", { count: "exact", head: true })
      .eq("contribution_id", contributionId),
    viewerUserId
      ? supabase
          .from("rabbithole_contribution_likes")
          .select("id")
          .eq("contribution_id", contributionId)
          .eq("user_id", viewerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("rabbithole_contribution_comments")
      .select("id, contribution_id, user_id, body, created_at")
      .eq("contribution_id", contributionId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("rabbithole_assets")
      .select("id, contribution_id, storage_provider, bucket, object_key, original_filename, mime_type, size_bytes, checksum_sha256, uploaded_by, access_level, status, is_primary, created_at, updated_at")
      .eq("contribution_id", contributionId)
      .in("status", ["uploaded", "ready"])
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
  ]);

  const commentRows = (commentRes.data ?? []) as any[];
  const userIds = Array.from(new Set(commentRows.map((row) => row.user_id).filter(Boolean)));
  let profileMap = new Map<string, { displayName: string; photoUrl: string | null }>();
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url")
      .in("user_id", userIds);

    profileMap = new Map(
      (profileRows ?? []).map((row: any) => {
        const displayName =
          row.display_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Member";
        return [row.user_id, { displayName, photoUrl: row.photo_url ?? null }];
      })
    );
  }

  const comments: RabbitholeContributionComment[] = commentRows.map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      id: row.id,
      contributionId: row.contribution_id,
      body: row.body ?? "",
      createdAt: row.created_at,
      authorId: row.user_id,
      authorName: profile?.displayName ?? "Member",
      authorPhotoUrl: profile?.photoUrl ?? null,
    };
  });

  const assets = (assetRes.data ?? []).map(mapContributionAssetRow);

  return {
    contribution: {
      ...contribution,
      likeCount: (likesRes as any).count ?? 0,
      commentCount: comments.length,
      viewerLiked: !!(viewerLikeRes as any).data,
    },
    comments,
    assets,
  };
}

export async function createRabbitholeAssetRecord(
  supabase: SupabaseClient,
  input: {
    contributionId: string;
    storageProvider: string;
    bucket: string;
    objectKey: string;
    uploadedBy: string;
    originalFilename?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    checksumSha256?: string | null;
    accessLevel?: "public" | "private" | "team";
    isPrimary?: boolean;
  },
): Promise<{ ok: boolean; assetId?: string; error?: string }> {
  const { data, error } = await supabase
    .from("rabbithole_assets")
    .insert({
      contribution_id: input.contributionId,
      storage_provider: input.storageProvider,
      bucket: input.bucket,
      object_key: input.objectKey,
      uploaded_by: input.uploadedBy,
      original_filename: input.originalFilename ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      checksum_sha256: input.checksumSha256 ?? null,
      access_level: input.accessLevel ?? "private",
      is_primary: input.isPrimary ?? false,
      status: "ready",
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { ok: false, error: error?.message || "Could not save asset metadata." };
  return { ok: true, assetId: data.id };
}

export async function toggleRabbitholeContributionLike(
  supabase: SupabaseClient,
  contributionId: string,
): Promise<{ ok: boolean; liked?: boolean; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const { data: existing } = await supabase
    .from("rabbithole_contribution_likes")
    .select("contribution_id, user_id")
    .eq("contribution_id", contributionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("rabbithole_contribution_likes")
      .delete()
      .eq("contribution_id", contributionId)
      .eq("user_id", userId);
    if (error) return { ok: false, error: "Could not remove like." };
    return { ok: true, liked: false };
  }

  const { error } = await supabase
    .from("rabbithole_contribution_likes")
    .insert({ contribution_id: contributionId, user_id: userId });
  if (error) return { ok: false, error: "Could not add like." };
  return { ok: true, liked: true };
}

export async function createRabbitholeContributionComment(
  supabase: SupabaseClient,
  input: { contributionId: string; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return { ok: false, error: "You must be logged in." };

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Comment cannot be empty." };
  if (body.length > 1200) return { ok: false, error: "Comment is too long." };

  const { error } = await supabase.from("rabbithole_contribution_comments").insert({
    contribution_id: input.contributionId,
    user_id: userId,
    body,
  });
  if (error) return { ok: false, error: "Could not post comment." };

  await supabase
    .from("rabbithole_contributions")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", input.contributionId);

  return { ok: true };
}
