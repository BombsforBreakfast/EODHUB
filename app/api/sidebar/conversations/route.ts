import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ConversationRow = {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_at: string;
  status: string;
  initiated_by: string | null;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  photo_url: string | null;
  account_type: string | null;
};

type UnreadRow = {
  conversation_id: string;
};

type PreviewRow = {
  conversation_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

const IN_QUERY_CHUNK_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function loadProfilesByIds(
  adminClient: SupabaseClient,
  userIds: string[],
): Promise<ProfileRow[]> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return [];

  const rows: ProfileRow[] = [];
  for (const chunk of chunkArray(uniqueIds, IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, account_type")
      .in("user_id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as ProfileRow[]));
  }
  return rows;
}

async function loadUnreadRows(
  adminClient: SupabaseClient,
  conversationIds: string[],
  userId: string,
): Promise<UnreadRow[]> {
  if (conversationIds.length === 0) return [];

  const rows: UnreadRow[] = [];
  for (const chunk of chunkArray(conversationIds, IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", chunk)
      .neq("sender_id", userId)
      .eq("is_read", false);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as UnreadRow[]));
  }
  return rows;
}

async function loadPreviewRows(
  adminClient: SupabaseClient,
  conversationIds: string[],
): Promise<PreviewRow[]> {
  if (conversationIds.length === 0) return [];

  const rows: PreviewRow[] = [];
  for (const chunk of chunkArray(conversationIds, IN_QUERY_CHUNK_SIZE)) {
    const previewScanLimit = Math.min(3000, Math.max(300, chunk.length * 25));
    const { data, error } = await adminClient
      .from("messages")
      .select("conversation_id, content, image_url, created_at")
      .in("conversation_id", chunk)
      .order("created_at", { ascending: false })
      .limit(previewScanLimit);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as PreviewRow[]));
  }
  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function parsePagination(req: NextRequest) {
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const rawOffset = Number(req.nextUrl.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_PAGE_SIZE;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
}

function normalizeSearch(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}

function profileDisplayName(profile: ProfileRow | undefined): string {
  return (
    profile?.display_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    "EOD Member"
  );
}

async function loadMatchingMessageConversationIds(
  adminClient: SupabaseClient,
  conversationIds: string[],
  query: string,
): Promise<Set<string>> {
  if (conversationIds.length === 0 || query.length < 2) return new Set();

  const matches = new Set<string>();
  const escaped = escapeLike(query);
  for (const chunk of chunkArray(conversationIds, IN_QUERY_CHUNK_SIZE)) {
    const { data, error } = await adminClient
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", chunk)
      .ilike("content", `%${escaped}%`)
      .limit(100);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ conversation_id: string }>) {
      matches.add(row.conversation_id);
    }
  }
  return matches;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { limit, offset } = parsePagination(req);
  const search = normalizeSearch(req.nextUrl.searchParams.get("q"));

  let conversations: ConversationRow[];
  let totalCount = 0;

  if (search.length >= 2) {
    const { data: allConvData, error: allConvError } = await adminClient
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at, status, initiated_by")
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .neq("status", "declined")
      .order("last_message_at", { ascending: false })
      .limit(1000);

    if (allConvError) {
      return NextResponse.json({ error: allConvError.message }, { status: 500 });
    }

    const allConversations = (allConvData ?? []) as ConversationRow[];
    const allOtherIds = allConversations.map((c) =>
      c.participant_1 === user.id ? c.participant_2 : c.participant_1,
    );

    let allProfiles: ProfileRow[];
    let messageMatchIds: Set<string>;
    try {
      [allProfiles, messageMatchIds] = await Promise.all([
        loadProfilesByIds(adminClient, allOtherIds),
        loadMatchingMessageConversationIds(adminClient, allConversations.map((c) => c.id), search),
      ]);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to search conversations" },
        { status: 500 },
      );
    }

    const searchProfileMap = new Map(allProfiles.map((profile) => [profile.user_id, profile]));
    const matched = allConversations.filter((conversation) => {
      const otherId = conversation.participant_1 === user.id ? conversation.participant_2 : conversation.participant_1;
      const profile = searchProfileMap.get(otherId);
      const haystack = [
        profileDisplayName(profile),
        profile?.first_name,
        profile?.last_name,
        profile?.display_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search) || messageMatchIds.has(conversation.id);
    });

    totalCount = matched.length;
    conversations = matched.slice(offset, offset + limit);
  } else {
    const { data: convData, error: convError, count } = await adminClient
      .from("conversations")
      .select("id, participant_1, participant_2, last_message_at, status, initiated_by", { count: "exact" })
      .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
      .neq("status", "declined")
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    conversations = (convData ?? []) as ConversationRow[];
    totalCount = count ?? conversations.length;
  }

  if (conversations.length === 0) {
    return NextResponse.json({ conversations: [], hasMore: false, nextOffset: offset });
  }

  const otherIds = conversations.map((c) =>
    c.participant_1 === user.id ? c.participant_2 : c.participant_1,
  );
  const acceptedIds = conversations
    .filter((c) => c.status === "accepted")
    .map((c) => c.id);

  let profileData: ProfileRow[];
  let unreadData: UnreadRow[];
  let previewRows: PreviewRow[];
  try {
    [profileData, unreadData, previewRows] = await Promise.all([
      loadProfilesByIds(adminClient, otherIds),
      loadUnreadRows(adminClient, acceptedIds, user.id),
      loadPreviewRows(adminClient, conversations.map((c) => c.id)),
    ]);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load conversations" },
      { status: 500 },
    );
  }

  const profileMap = new Map<string, ProfileRow>();
  for (const p of profileData) {
    profileMap.set(p.user_id, p);
  }

  const unreadMap = new Map<string, number>();
  for (const row of unreadData) {
    unreadMap.set(row.conversation_id, (unreadMap.get(row.conversation_id) ?? 0) + 1);
  }

  const previewMap = new Map<string, string>();
  for (const row of previewRows) {
    if (!previewMap.has(row.conversation_id)) {
      previewMap.set(row.conversation_id, row.content?.trim() || (row.image_url ? "[Photo]" : ""));
    }
  }

  const response = conversations.map((c) => {
    const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
    const profile = profileMap.get(otherId);
    const name = profileDisplayName(profile);

    return {
      id: c.id,
      participant_1: c.participant_1,
      participant_2: c.participant_2,
      last_message_at: c.last_message_at,
      status: c.status,
      initiated_by: c.initiated_by,
      other_user_id: otherId,
      other_user_name: name,
      other_user_photo: profile?.photo_url ?? null,
      other_user_account_type: profile?.account_type ?? null,
      unread_count: unreadMap.get(c.id) ?? 0,
      last_message_preview: previewMap.get(c.id) ?? null,
    };
  });

  return NextResponse.json({
    conversations: response,
    hasMore: offset + conversations.length < totalCount,
    nextOffset: offset + conversations.length,
  });
}

