import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { blocksSignupApproval } from "@/app/lib/profileCompleteness";
import { assertMemberInteractionAllowed } from "../../lib/memberSubscriptionServer";
import { createNotification } from "../../lib/notificationsServer";
import { approveUserAccount } from "../../lib/server/approveUserAccount";
import { devAuthLog } from "../../lib/auth/signupErrors";

const VOUCHES_NEEDED = 3;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
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

  const gate = await assertMemberInteractionAllowed(adminClient, user.id);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: 403 });
  }

  // Voucher must be verified (is_approved and/or admin-verified members)
  const { data: voucher } = await adminClient
    .from("profiles")
    .select("is_approved, verification_status, first_name, last_name, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const voucherOk =
    voucher?.is_approved === true || voucher?.verification_status === "verified";
  if (!voucherOk) {
    return NextResponse.json({ error: "Only verified members can vouch" }, { status: 403 });
  }

  const { vouchee_user_id } = await req.json();
  if (!vouchee_user_id) return NextResponse.json({ error: "Missing vouchee_user_id" }, { status: 400 });
  if (vouchee_user_id === user.id) return NextResponse.json({ error: "Cannot vouch for yourself" }, { status: 400 });

  // Check vouchee is actually pending
  const { data: vouchee } = await adminClient
    .from("profiles")
    .select(
      "first_name, last_name, display_name, verification_status, account_type, email_verified, service, company_name, is_pure_admin",
    )
    .eq("user_id", vouchee_user_id)
    .maybeSingle();

  if (!vouchee) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (blocksSignupApproval(vouchee)) {
    return NextResponse.json(
      { error: "User must complete onboarding (first and last name) before vouching." },
      { status: 409 },
    );
  }
  const awaitingAdmin =
    vouchee.email_verified &&
    (vouchee.verification_status === "awaiting_admin_review" ||
      vouchee.verification_status === "pending_admin_review" ||
      vouchee.verification_status === "pending");
  if (!awaitingAdmin) {
    return NextResponse.json({ error: "User is not awaiting community verification" }, { status: 409 });
  }
  if (vouchee.account_type === "employer") {
    return NextResponse.json({ error: "Employer accounts use a different approval flow" }, { status: 400 });
  }

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
    .select("voucher_user_id", { count: "exact", head: true })
    .eq("vouchee_user_id", vouchee_user_id);

  const totalVouches = count ?? 0;
  let approved = false;

  let emailSent = false;
  if (totalVouches >= VOUCHES_NEEDED) {
    approved = true;

    const voucherName = voucher.display_name || `${voucher.first_name ?? ""} ${voucher.last_name ?? ""}`.trim() || "A member";

    await createNotification(adminClient, {
      recipientUserId: vouchee_user_id,
      actorUserId: user.id,
      actorName: voucherName,
      type: "user_verified",
      category: "system",
      message: `You've been verified! ${voucherName} cast the final vote. Welcome to EOD HUB.`,
      link: `/profile/${encodeURIComponent(vouchee_user_id)}`,
      groupKey: `user:${vouchee_user_id}:verification`,
      dedupeKey: `user_verified:${vouchee_user_id}`,
      metadata: { vouchee_user_id },
    });

    const origin = req.nextUrl.origin;
    try {
      const approvalResult = await approveUserAccount(
        adminClient,
        vouchee_user_id,
        origin,
        "vouch",
      );
      emailSent = approvalResult.emailSent;
      devAuthLog("profile-vouch", {
        step: "approved",
        vouchee_user_id,
        emailSent,
        emailSkippedReason: approvalResult.emailSkippedReason,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("profile-vouch approveUserAccount:", msg);
      devAuthLog("profile-vouch", { step: "approve_failed", vouchee_user_id, error: msg });
    }
  }

  return NextResponse.json({ success: true, vouches: totalVouches, approved, emailSent });
}
