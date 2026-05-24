import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DigestLogRow = {
  id: string;
  user_id: string;
  digest_type: string;
  window_start: string;
  window_end: string;
  sent_at: string;
  status: string;
  resend_message_id: string | null;
  error_message: string | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: authData } = await userClient.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { data: logsData, error: logsError } = await adminClient
    .from("digest_send_logs")
    .select("id, user_id, digest_type, window_start, window_end, sent_at, status, resend_message_id, error_message")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const logs = (logsData ?? []) as DigestLogRow[];
  const userIds = Array.from(new Set(logs.map((log) => log.user_id)));
  const { data: profilesData } = userIds.length > 0
    ? await adminClient
        .from("profiles")
        .select("user_id, email, display_name, first_name, last_name")
        .in("user_id", userIds)
    : { data: [] as ProfileRow[] };

  const profileById = new Map(
    ((profilesData ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]),
  );

  return NextResponse.json({
    logs: logs.map((log) => {
      const profile = profileById.get(log.user_id);
      const name =
        profile?.display_name ||
        `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
        "Unknown user";
      return {
        ...log,
        recipient_name: name,
        recipient_email: profile?.email ?? null,
      };
    }),
  });
}
