import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { assertMemberInteractionAllowed } from "../../lib/memberSubscriptionServer";

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
    voucher?.is_approved === true ||
    voucher?.verification_status === "verified";
  if (!voucherOk) {
    return NextResponse.json({ error: "Only verified members can vouch" }, { status: 403 });
  }

  const { vouchee_user_id } = await req.json();
  if (!vouchee_user_id) return NextResponse.json({ error: "Missing vouchee_user_id" }, { status: 400 });
  if (vouchee_user_id === user.id) return NextResponse.json({ error: "Cannot vouch for yourself" }, { status: 400 });

  // Check vouchee is actually pending
  const { data: vouchee } = await adminClient
    .from("profiles")
    .select("first_name, last_name, display_name, verification_status, account_type")
    .eq("user_id", vouchee_user_id)
    .maybeSingle();

  if (!vouchee) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (vouchee.verification_status !== "pending") {
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
    .select("*", { count: "exact", head: true })
    .eq("vouchee_user_id", vouchee_user_id);

  const totalVouches = count ?? 0;
  let approved = false;

  if (totalVouches >= VOUCHES_NEEDED) {
    await adminClient
      .from("profiles")
      .update({ is_approved: true, verification_status: "verified" })
      .eq("user_id", vouchee_user_id);
    approved = true;

    const voucherName = voucher.display_name || `${voucher.first_name ?? ""} ${voucher.last_name ?? ""}`.trim() || "A member";

    // In-app notification
    await adminClient.from("notifications").insert({
      user_id: vouchee_user_id,
      message: `You've been verified! ${voucherName} cast the final vote. Welcome to EOD HUB.`,
      actor_name: voucherName,
      post_owner_id: null,
    });

    // Verification email
    const { data: authUser } = await adminClient.auth.admin.getUserById(vouchee_user_id);
    const email = authUser?.user?.email;
    const firstName = vouchee.first_name || "EOD Member";

    // Fetch their referral code for the email
    const { data: voucheeProfile } = await adminClient
      .from("profiles")
      .select("referral_code")
      .eq("user_id", vouchee_user_id)
      .maybeSingle();
    const referralCode = (voucheeProfile as { referral_code: string | null } | null)?.referral_code;

    if (email && process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const referralSection = referralCode ? `
        <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 24px;">
          <p style="font-size: 15px; font-weight: 700; color: #111; margin: 0 0 8px;">Invite 5 colleagues, earn a Recruiter Badge</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin: 0 0 14px;">
            Share your personal invite link with fellow EOD professionals. When 5 of them join and get verified, you earn your Bronze Recruiter badge on your profile.
          </p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 12px 16px; font-size: 14px; font-weight: 700; word-break: break-all; color: #111;">
            https://eod-hub.com/login?ref=${referralCode}
          </div>
        </div>
      ` : "";

      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
        to: email,
        subject: "EOD Verification Complete",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
            <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 24px;">EOD HUB</div>
            <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 24px;">
              Good news, ${firstName} — you're verified!<br><br>
              3 members of the community vouched for you. Navigate to the link below to sign in to EOD HUB.
            </p>
            <a href="https://eod-hub.com/login"
               style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
              Sign In to EOD HUB
            </a>
            ${referralSection}
            <p style="font-size: 13px; color: #999; margin-top: 32px;">
              Built for EOD Techs, by an EOD Tech.
            </p>
          </div>
        `,
      });
    }
  }

  return NextResponse.json({ success: true, vouches: totalVouches, approved });
}
