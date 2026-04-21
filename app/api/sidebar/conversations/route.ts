import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { data: convData, error: convError } = await adminClient
    .from("conversations")
    .select("id, participant_1, participant_2, last_message_at, status, initiated_by")
    .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
    .neq("status", "declined")
    .order("last_message_at", { ascending: false });

  if (convError) {
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  const conversations = (convData ?? []) as ConversationRow[];
  if (conversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const otherIds = conversations.map((c) =>
    c.participant_1 === user.id ? c.participant_2 : c.participant_1,
  );
  const acceptedIds = conversations
    .filter((c) => c.status === "accepted")
    .map((c) => c.id);

  const [{ data: profileData }, { data: unreadData }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("user_id, first_name, last_name, display_name, photo_url, account_type")
      .in("user_id", otherIds),
    acceptedIds.length > 0
      ? adminClient
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", acceptedIds)
          .neq("sender_id", user.id)
          .eq("is_read", false)
      : Promise.resolve({ data: [] as { conversation_id: string }[] }),
  ]);

  const profileMap = new Map<string, ProfileRow>();
  for (const p of (profileData ?? []) as ProfileRow[]) {
    profileMap.set(p.user_id, p);
  }

  const unreadMap = new Map<string, number>();
  for (const row of (unreadData ?? []) as { conversation_id: string }[]) {
    unreadMap.set(row.conversation_id, (unreadMap.get(row.conversation_id) ?? 0) + 1);
  }

  const previewScanLimit = Math.min(6000, Math.max(600, conversations.length * 25));
  const { data: previewRows } = await adminClient
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversations.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(previewScanLimit);

  const previewMap = new Map<string, string>();
  for (const row of (previewRows ?? []) as { conversation_id: string; content: string }[]) {
    if (!previewMap.has(row.conversation_id)) {
      previewMap.set(row.conversation_id, row.content);
    }
  }

  const response = conversations.map((c) => {
    const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
    const profile = profileMap.get(otherId);
    const name =
      profile?.display_name ||
      `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
      "EOD Member";

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

  return NextResponse.json({ conversations: response });
}

