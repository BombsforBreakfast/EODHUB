import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createNotification } from "@/app/lib/notificationsServer";
import { awardPlankHolderIfEligible } from "@/app/lib/server/plankHolderChallenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConnectionAction = "know" | "confirm" | "deny" | "cancel" | "worked_with";

type ConnectionRow = {
  id: string;
  requester_user_id: string;
  target_user_id: string;
  status: "pending" | "accepted" | "denied";
  worked_with: boolean;
  requester_worked_with_target?: boolean | null;
  target_worked_with_requester?: boolean | null;
};

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  privacy_who_can_request: "everyone" | "connections" | "nobody" | null;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function displayName(profile: Pick<ProfileRow, "first_name" | "last_name" | "display_name"> | null): string {
  return profile?.display_name?.trim()
    || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim()
    || "Someone";
}

function isMissingHandshakeColumnError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return message.includes("requester_worked_with_target")
    || message.includes("target_worked_with_requester");
}

async function getCaller(req: NextRequest) {
  const token = (req.headers.get("Authorization") ?? req.headers.get("authorization"))?.replace("Bearer ", "");
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { error: NextResponse.json({ error: "Server misconfiguration" }, { status: 503 }) };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData } = await userClient.auth.getUser();
  const caller = authData.user;
  if (!caller) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  return {
    caller,
    admin: createClient(supabaseUrl, serviceKey),
  };
}

async function loadRelationship(
  admin: SupabaseClient,
  actorId: string,
  targetId: string,
): Promise<ConnectionRow | null> {
  const result = await admin
    .from("profile_connections")
    .select(
      "id, requester_user_id, target_user_id, status, worked_with, requester_worked_with_target, target_worked_with_requester",
    )
    .or(
      `and(requester_user_id.eq.${actorId},target_user_id.eq.${targetId}),` +
      `and(requester_user_id.eq.${targetId},target_user_id.eq.${actorId})`,
    )
    .maybeSingle();
  if (!result.error || !isMissingHandshakeColumnError(result.error)) {
    if (result.error) throw new Error(result.error.message);
    return (result.data as ConnectionRow | null) ?? null;
  }

  const { data, error } = await admin
    .from("profile_connections")
    .select("id, requester_user_id, target_user_id, status, worked_with")
    .or(
      `and(requester_user_id.eq.${actorId},target_user_id.eq.${targetId}),` +
      `and(requester_user_id.eq.${targetId},target_user_id.eq.${actorId})`,
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConnectionRow | null) ?? null;
}

async function updateConnection(
  admin: SupabaseClient,
  connectionId: string,
  updateWithHandshakeColumns: Record<string, unknown>,
  updateWithoutHandshakeColumns: Record<string, unknown>,
) {
  const result = await admin
    .from("profile_connections")
    .update(updateWithHandshakeColumns)
    .eq("id", connectionId);
  if (!result.error || !isMissingHandshakeColumnError(result.error)) return result;

  return admin
    .from("profile_connections")
    .update(updateWithoutHandshakeColumns)
    .eq("id", connectionId);
}

async function loadProfile(admin: SupabaseClient, userId: string): Promise<ProfileRow | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("first_name, last_name, display_name, privacy_who_can_request")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow | null) ?? null;
}

async function ensureCanRequest(admin: SupabaseClient, actorId: string, targetId: string) {
  const targetProfile = await loadProfile(admin, targetId);
  const policy = targetProfile?.privacy_who_can_request ?? "everyone";
  if (policy === "nobody") {
    throw new Error("This member is not accepting new Know requests.");
  }
  if (policy === "connections") {
    const { data, error } = await admin.rpc("users_share_accepted_connection", {
      a: actorId,
      b: targetId,
    });
    if (error) throw new Error(error.message);
    if (data !== true) {
      throw new Error("This member only accepts requests from people they know in common with you.");
    }
  }
}

async function notifyConnection(
  admin: SupabaseClient,
  params: {
    recipientId: string;
    actorId: string;
    actorName: string;
    type: "connection_request" | "connection_accepted" | "connection_denied" | "worked_with";
    message: string;
    connectionId: string;
  },
) {
  if (params.recipientId === params.actorId) return;
  await createNotification(admin, {
    recipientUserId: params.recipientId,
    actorUserId: params.actorId,
    actorName: params.actorName,
    postOwnerId: params.actorId,
    type: params.type,
    category: "social",
    entityType: "profile_connection",
    entityId: params.connectionId,
    message: params.message,
    link: `/profile/${encodeURIComponent(params.actorId)}`,
    groupKey: `profile_connection:${params.connectionId}:${params.type}`,
    dedupeKey: `${params.type}:${params.connectionId}:${params.actorId}`,
    metadata: { connection_id: params.connectionId },
  });
}

function relationState(row: ConnectionRow, actorId: string) {
  if (row.status === "accepted") return "accepted";
  if (row.status === "pending" && row.requester_user_id === actorId) return "pending_outgoing";
  if (row.status === "pending" && row.target_user_id === actorId) return "pending_incoming";
  return "none";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getCaller(req);
    if ("error" in auth) return auth.error;

    let body: { action?: unknown; targetUserId?: unknown; workedWith?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const action = cleanString(body.action) as ConnectionAction;
    const targetUserId = cleanString(body.targetUserId);
    if (!targetUserId || targetUserId === auth.caller.id) {
      return NextResponse.json({ ok: false, error: "Invalid target user" }, { status: 400 });
    }
    if (!["know", "confirm", "deny", "cancel", "worked_with"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
    }

    const actorProfile = await loadProfile(auth.admin, auth.caller.id);
    const actorName = displayName(actorProfile);
    const existing = await loadRelationship(auth.admin, auth.caller.id, targetUserId);
    const now = new Date().toISOString();
    const tryAwardActor = async () => {
      try {
        await awardPlankHolderIfEligible(auth.admin, auth.caller.id);
      } catch (error) {
        console.error("plank holder connection award check failed:", error);
      }
    };

    if (action === "know") {
      if (!existing) {
        await ensureCanRequest(auth.admin, auth.caller.id, targetUserId);
        const { data, error } = await auth.admin
          .from("profile_connections")
          .insert({
            requester_user_id: auth.caller.id,
            target_user_id: targetUserId,
            status: "pending",
            worked_with: false,
          })
          .select("id, requester_user_id, target_user_id, status, worked_with")
          .single();
        if (error) throw new Error(error.message);
        const row = data as ConnectionRow;
        await notifyConnection(auth.admin, {
          recipientId: targetUserId,
          actorId: auth.caller.id,
          actorName,
          type: "connection_request",
          message: `${actorName} marked that they know you.`,
          connectionId: row.id,
        });
        await tryAwardActor();
        return NextResponse.json({ ok: true, state: "pending_outgoing", connectionId: row.id });
      }

      if (existing.status === "accepted") {
        await tryAwardActor();
        return NextResponse.json({ ok: true, state: "accepted", connectionId: existing.id, confirmed: false });
      }

      if (existing.status === "pending") {
        if (existing.requester_user_id === auth.caller.id) {
          await tryAwardActor();
          return NextResponse.json({ ok: true, state: "pending_outgoing", connectionId: existing.id });
        }

        const { data, error } = await auth.admin
          .from("profile_connections")
          .update({
            status: "accepted",
            responded_at: now,
            responded_by_user_id: auth.caller.id,
          })
          .eq("id", existing.id)
          .select("id, requester_user_id, target_user_id, status, worked_with")
          .single();
        if (error) throw new Error(error.message);
        const row = data as ConnectionRow;
        await notifyConnection(auth.admin, {
          recipientId: row.requester_user_id,
          actorId: auth.caller.id,
          actorName,
          type: "connection_accepted",
          message: `${actorName} confirmed that they know you too.`,
          connectionId: row.id,
        });
        await tryAwardActor();
        return NextResponse.json({ ok: true, state: "accepted", connectionId: row.id, confirmed: true });
      }

      await ensureCanRequest(auth.admin, auth.caller.id, targetUserId);
      const resetUpdate = {
        requester_user_id: auth.caller.id,
        target_user_id: targetUserId,
        status: "pending",
        worked_with: false,
        requester_worked_with_target: false,
        target_worked_with_requester: false,
        responded_at: null,
        responded_by_user_id: null,
      };
      const resetLegacyUpdate = {
        requester_user_id: auth.caller.id,
        target_user_id: targetUserId,
        status: "pending",
        worked_with: false,
        responded_at: null,
        responded_by_user_id: null,
      };
      const resetResult = await updateConnection(auth.admin, existing.id, resetUpdate, resetLegacyUpdate);
      if (resetResult.error) throw new Error(resetResult.error.message);
      const { data, error } = await auth.admin
        .from("profile_connections")
        .select("id, requester_user_id, target_user_id, status, worked_with")
        .eq("id", existing.id)
        .single();
      if (error) throw new Error(error.message);
      const row = data as ConnectionRow;
      await notifyConnection(auth.admin, {
        recipientId: targetUserId,
        actorId: auth.caller.id,
        actorName,
        type: "connection_request",
        message: `${actorName} marked that they know you.`,
        connectionId: row.id,
      });
      await tryAwardActor();
      return NextResponse.json({ ok: true, state: "pending_outgoing", connectionId: row.id });
    }

    if (!existing) {
      return NextResponse.json({ ok: false, error: "No relationship exists" }, { status: 404 });
    }

    if (action === "confirm") {
      if (existing.status !== "pending" || existing.target_user_id !== auth.caller.id) {
        return NextResponse.json({ ok: false, error: "Only incoming pending requests can be confirmed" }, { status: 403 });
      }
      const { error } = await auth.admin
        .from("profile_connections")
        .update({
          status: "accepted",
          responded_at: now,
          responded_by_user_id: auth.caller.id,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      await notifyConnection(auth.admin, {
        recipientId: existing.requester_user_id,
        actorId: auth.caller.id,
        actorName,
        type: "connection_accepted",
        message: `${actorName} confirmed that they know you too.`,
        connectionId: existing.id,
      });
      await tryAwardActor();
      return NextResponse.json({ ok: true, state: "accepted", connectionId: existing.id, confirmed: true });
    }

    if (action === "deny") {
      if (existing.status !== "pending" || existing.target_user_id !== auth.caller.id) {
        return NextResponse.json({ ok: false, error: "Only incoming pending requests can be denied" }, { status: 403 });
      }
      const denyResult = await updateConnection(
        auth.admin,
        existing.id,
        {
          status: "denied",
          worked_with: false,
          requester_worked_with_target: false,
          target_worked_with_requester: false,
          responded_at: now,
          responded_by_user_id: auth.caller.id,
        },
        {
          status: "denied",
          worked_with: false,
          responded_at: now,
          responded_by_user_id: auth.caller.id,
        },
      );
      if (denyResult.error) throw new Error(denyResult.error.message);
      await notifyConnection(auth.admin, {
        recipientId: existing.requester_user_id,
        actorId: auth.caller.id,
        actorName,
        type: "connection_denied",
        message: `${actorName} declined your Know request.`,
        connectionId: existing.id,
      });
      return NextResponse.json({ ok: true, state: "denied", connectionId: existing.id });
    }

    if (action === "cancel") {
      if (existing.status !== "pending" || existing.requester_user_id !== auth.caller.id) {
        return NextResponse.json({ ok: false, error: "Only outgoing pending requests can be canceled" }, { status: 403 });
      }
      const { error } = await auth.admin
        .from("profile_connections")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, state: "none" });
    }

    // worked_with
    if (existing.status !== "accepted") {
      return NextResponse.json({ ok: false, error: "Worked With requires a confirmed Know connection" }, { status: 403 });
    }
    const hasSideSpecificWorkedWith =
      typeof existing.requester_worked_with_target === "boolean" &&
      typeof existing.target_worked_with_requester === "boolean";
    const turningOn = typeof body.workedWith === "boolean"
      ? body.workedWith
      : hasSideSpecificWorkedWith
        ? existing.requester_user_id === auth.caller.id
          ? !existing.requester_worked_with_target
          : !existing.target_worked_with_requester
        : !existing.worked_with;
    const update = existing.requester_user_id === auth.caller.id
      ? { requester_worked_with_target: turningOn }
      : { target_worked_with_requester: turningOn };
    const workedWithResult = hasSideSpecificWorkedWith
      ? await auth.admin
        .from("profile_connections")
        .update(update)
        .eq("id", existing.id)
        .eq("status", "accepted")
      : await auth.admin
        .from("profile_connections")
        .update({ worked_with: turningOn })
        .eq("id", existing.id)
        .eq("status", "accepted");
    if (workedWithResult.error) throw new Error(workedWithResult.error.message);
    if (turningOn) {
      const recipientId = existing.requester_user_id === auth.caller.id
        ? existing.target_user_id
        : existing.requester_user_id;
      await notifyConnection(auth.admin, {
        recipientId,
        actorId: auth.caller.id,
        actorName,
        type: "worked_with",
        message: `${actorName} marked that they worked with you.`,
        connectionId: existing.id,
      });
    }
    return NextResponse.json({
      ok: true,
      state: "accepted",
      connectionId: existing.id,
      workedWith: turningOn,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection action failed";
    console.error("profile-connections/action:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
