import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  const authorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && querySecret === cronSecret);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    return NextResponse.json({ error: "ADMIN_EMAIL env var not set" }, { status: 500 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Count users pending verification
  const { data: pending } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, display_name, created_at")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true });

  if (!pending || pending.length === 0) {
    return NextResponse.json({ sent: false, reason: "No pending users" });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const count = pending.length;

  const userRows = pending
    .map((p) => {
      const name = p.display_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown";
      const since = new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return `<tr><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${name}</td><td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #666;">${since}</td></tr>`;
    })
    .join("");

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: adminEmail,
    subject: `${count} user${count === 1 ? "" : "s"} waiting for verification — EOD HUB`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <div style="font-size: 32px; font-weight: 900; letter-spacing: -1px; margin-bottom: 24px;">EOD HUB</div>
        <p style="font-size: 16px; color: #222; line-height: 1.7; margin: 0 0 24px;">
          You have <strong>${count} user${count === 1 ? "" : "s"}</strong> waiting for verification.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Name</th>
              <th style="padding: 8px 12px; text-align: left; font-weight: 700;">Signed Up</th>
            </tr>
          </thead>
          <tbody>${userRows}</tbody>
        </table>
        <a href="https://eod-hub.com/admin"
           style="display: inline-block; background: black; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
          Review in Admin Panel
        </a>
        <p style="font-size: 13px; color: #999; margin-top: 32px;">
          Built for EOD Techs, by an EOD Tech.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ sent: !error, count, error: error?.message });
}
