import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VOUCHES_NEEDED = 3;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Voucher must be an approved member
  const { data: voucher } = await adminClient
    .from("profiles")
    .select("is_approved, first_name, last_name, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!voucher?.is_approved) {
    return NextResponse.json({ error: "Only approved members can vouch" }, { status: 403 });
  }

  const { vouchee_user_id } = await req.json();
  if (!vouchee_user_id) return NextResponse.json({ error: "Missing vouchee_user_id" }, { status: 400 });
  if (vouchee_user_id === user.id) return NextResponse.json({ error: "Cannot vouch for yourself" }, { status: 400 });

  // Check vouchee is actually pending
  const { data: vouchee } = await adminClient
    .from("profiles")
    .select("is_approved, first_name, last_name, display_name")
    .eq("user_id", vouchee_user_id)
    .maybeSingle();

  if (!vouchee) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (vouchee.is_approved) return NextResponse.json({ error: "User is already approved" }, { status: 409 });

  // Upsert vouch (idempotent)
  const { error: vouchError } = await adminClient
    .from("profile_vouches")
    .upsert(
      { vouchee_user_id, voucher_user_id: user.id },
      { onConflict: "vouchee_user_id,voucher_user_id" }
    );

  if (vouchError) return NextResponse.json({ error: vouchError.message }, { status: 500 });

  // Count total vouches
  const { count } = await adminClient
    .from("profile_vouches")
    .select("*", { count: "exact", head: true })
    .eq("vouchee_user_id", vouchee_user_id);

  const totalVouches = count ?? 0;
  let approved = false;

  if (totalVouches >= VOUCHES_NEEDED) {
    await adminClient
      .from("profiles")
      .update({ is_approved: true })
      .eq("user_id", vouchee_user_id);
    approved = true;

    // Notify the newly approved user
    const voucherName = voucher.display_name || `${voucher.first_name ?? ""} ${voucher.last_name ?? ""}`.trim() || "A member";
    await adminClient.from("notifications").insert({
      user_id: vouchee_user_id,
      message: `You've been approved! ${voucherName} cast the final vote. Welcome to EOD HUB.`,
      actor_name: voucherName,
      post_owner_id: null,
    });
  }

  return NextResponse.json({ success: true, vouches: totalVouches, approved });
}
