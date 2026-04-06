import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  try {
  // Verify caller is admin
  const authHeader = req.headers.get("authorization");
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
  const user = authData?.user;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: adminProfile } = await userClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Update verification status
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ verification_status: "verified", is_approved: true })
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: "DB update failed: " + updateError.message }, { status: 500 });
  }

  // Get user email via admin API
  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) {
    // Verification succeeded even if email fails — return success
    return NextResponse.json({ success: true, emailSent: false });
  }

  const email = userData.user.email;

  // Get their name for the email
  const { data: profile } = await adminClient
    .from("profiles")
    .select("first_name, referral_code")
    .eq("user_id", userId)
    .maybeSingle();

  const firstName = (profile as { first_name: string | null; referral_code: string | null } | null)?.first_name || "EOD Member";
  const referralCode = (profile as { first_name: string | null; referral_code: string | null } | null)?.referral_code;

  // Send verification email via Resend
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ success: true, emailSent: false, reason: "RESEND_API_KEY not set" });
  }

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

  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: email,
    subject: "EOD Verification Complete",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 24px;">EOD HUB</div>
        <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 24px;">
          Good news, ${firstName} — you're verified!<br><br>
          Navigate to the link below to sign in to EOD HUB.
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

  return NextResponse.json({ success: true, emailSent: !emailError });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Unexpected error: " + msg }, { status: 500 });
  }
}
