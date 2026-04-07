"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RabbitholeReply, RabbitholeThread, RabbitholeTopic } from "./types";

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
    body: row.body,
    topicSlug: topic?.slug ?? "unknown",
    topicName: topic?.name ?? "Unknown Topic",
    subtopic: subtopic?.name ?? row.subtopic_custom ?? undefined,
    tags,
    author: row.author_id,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    replyCount: row.reply_count ?? 0,
    isHighValue: row.is_high_value ?? false,
  };
}

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

export async function fetchRabbitholeThreads(
  supabase: SupabaseClient,
  options?: { topicSlug?: string; limit?: number },
): Promise<RabbitholeThread[]> {
  let query = supabase
    .from("rabbithole_threads")
    .select(`
      id, title, body, author_id, created_at, last_activity_at, reply_count, is_high_value, subtopic_custom,
      rabbithole_topics!inner(slug, name),
      rabbithole_subtopics(name),
      rabbithole_thread_tags(rabbithole_tags(name, slug))
    `)
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
      .select(`
        id, title, body, author_id, created_at, last_activity_at, reply_count, is_high_value, subtopic_custom,
        rabbithole_topics!inner(slug, name),
        rabbithole_subtopics(name),
        rabbithole_thread_tags(rabbithole_tags(name, slug))
      `)
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
      .select(`
        id, title, body, author_id, created_at, last_activity_at, reply_count, is_high_value, subtopic_custom,
        rabbithole_topics!inner(slug, name),
        rabbithole_subtopics(name),
        rabbithole_thread_tags(rabbithole_tags(name, slug))
      `)
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
        const pool = [thread.title, thread.body, thread.subtopic ?? "", ...thread.tags, thread.topicSlug].map(normalize).join(" ");
        expandedTerms.forEach((term) => {
          if (!term) return;
          if (pool.includes(term)) score += 1;
          if (normalize(thread.title).includes(term)) score += 2;
          if (thread.tags.map(normalize).some((tag) => tag.includes(term))) score += 3;
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
    .select(`
      id, title, body, author_id, created_at, last_activity_at, reply_count, is_high_value, subtopic_custom,
      rabbithole_topics!inner(slug, name),
      rabbithole_subtopics(name),
      rabbithole_thread_tags(rabbithole_tags(name, slug))
    `)
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

export async function createRabbitholeThread(
  supabase: SupabaseClient,
  input: { title: string; body: string; topicSlug: string; subtopic?: string; tags: string[] },
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
      body: input.body.trim(),
      topic_id: topicRow.id,
      subtopic_custom: input.subtopic?.trim() || null,
      author_id: userId,
      status: "active",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (insertErr || !insertData?.id) return { ok: false, error: "Could not create thread." };

  if (input.tags.length > 0) {
    const cleanedTags = Array.from(new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)));
    const tagIds: string[] = [];
    for (const tag of cleanedTags) {
      const slug = normalize(tag).replace(/\s+/g, "-");
      let tagId: string | null = null;
      const { data: existing } = await supabase
        .from("rabbithole_tags")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (existing?.id) tagId = existing.id;
      else {
        const { data: created } = await supabase
          .from("rabbithole_tags")
          .insert({ name: tag, slug, created_by: userId })
          .select("id")
          .maybeSingle();
        if (created?.id) tagId = created.id;
      }
      if (tagId) tagIds.push(tagId);
    }
    if (tagIds.length > 0) {
      await supabase.from("rabbithole_thread_tags").insert(tagIds.map((tagId) => ({ thread_id: insertData.id, tag_id: tagId })));
    }
  }

  return { ok: true, threadId: insertData.id };
}

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
