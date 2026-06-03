import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Server misconfiguration: missing service role key" }, { status: 500 });
    }

    const token = authHeader.slice(7);
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: authData } = await userClient.auth.getUser();
    if (!authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminProfile } = await userClient
      .from("profiles")
      .select("is_admin")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (!adminProfile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("id");
    if (!userId) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Admin deletion is a true hard delete (unlike self-service deletion, which
    // anonymizes into a ghost profile). The profiles -> auth.users cascade was
    // removed for ghost profiles, so deleting the auth user alone would leave an
    // orphaned profile row that still shows in the admin list and vouch feed.
    // We delete the profile row directly; cascades clear posts, vouches, unit
    // data, conversations, messages, notifications, cert uploads, etc. The only
    // RESTRICT dependency (post_comments) must be cleared first.
    const { error: commentsErr } = await adminClient
      .from("post_comments")
      .delete()
      .eq("user_id", userId);
    if (commentsErr) {
      return NextResponse.json(
        { error: `Failed clearing comments: ${commentsErr.message}` },
        { status: 500 }
      );
    }

    const { error: profileErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("user_id", userId);
    if (profileErr) {
      return NextResponse.json(
        { error: `Failed deleting profile: ${profileErr.message}` },
        { status: 500 }
      );
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      // Profile is already gone (removed from admin list and vouch). Surface the
      // auth failure so the admin knows the auth record may need manual cleanup.
      return NextResponse.json(
        { error: `Profile removed, but auth user delete failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unexpected error: " + msg }, { status: 500 });
  }
}
