import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  // Verify caller is admin
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Update verification status
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ verification_status: "verified" })
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get user email via admin API
  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    // Verification succeeded even if email fails — return success
    return NextResponse.json({ success: true, emailSent: false });
  }

  const email = userData.user.email;

  // Get their name for the email
  const { data: profile } = await adminClient
    .from("profiles")
    .select("first_name")
    .eq("user_id", userId)
    .maybeSingle();

  const firstName = (profile as { first_name: string | null } | null)?.first_name || "EOD Member";

  // Send verification email via Resend
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ success: true, emailSent: false, reason: "RESEND_API_KEY not set" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: email,
    subject: "You're verified — Welcome to EOD HUB",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 24px;">EOD HUB</div>
        <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 16px;">You're verified, ${firstName}.</h2>
        <p style="font-size: 16px; color: #444; line-height: 1.6; margin: 0 0 24px;">
          Your EOD HUB account has been reviewed and approved. You now have full access to the community — connect with fellow EOD professionals, browse job listings, and join the conversation.
        </p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://eodhub.com"}/login"
           style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
          Log In Now
        </a>
        <p style="font-size: 13px; color: #999; margin-top: 32px;">
          EOD HUB — Built by the community, for the community.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ success: true, emailSent: !emailError });
}
