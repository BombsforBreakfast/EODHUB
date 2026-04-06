import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";
import { Resend } from "resend";
import {
  buildReengagementEmailHtml,
  fetchReengagementDigestStats,
  type ReengagementUserContext,
} from "../../../lib/reengagementEmail";

function parseEnvInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isUserInactive(user: User, inactiveDays: number): boolean {
  const last = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : null;
  const threshold = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
  if (last == null) {
    const created = new Date(user.created_at).getTime();
    return created < threshold;
  }
  return last < threshold;
}

function canSendAgain(sentAt: string | null, cooldownDays: number): boolean {
  if (!sentAt) return true;
  const t = new Date(sentAt).getTime();
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000;
  return Date.now() - t > cooldownMs;
}

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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not set", sent: 0 },
      { status: 500 }
    );
  }

  const inactiveDays = parseEnvInt("REENGAGEMENT_INACTIVE_DAYS", 2);
  const statsWindowDays = parseEnvInt("REENGAGEMENT_STATS_WINDOW_DAYS", 7);
  const cooldownDays = parseEnvInt("REENGAGEMENT_EMAIL_COOLDOWN_DAYS", 10);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let stats;
  try {
    stats = await fetchReengagementDigestStats(admin, statsWindowDays);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const from =
    process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>";

  let sent = 0;
  let skipped = 0;
  let errors = 0;
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json(
        { error: error.message, sent, skipped, errors },
        { status: 500 }
      );
    }
    const users = data?.users ?? [];
    if (users.length === 0) break;

    const candidateIds = users.filter((u) => u.email).map((u) => u.id);

    const { data: profiles } = await admin
      .from("profiles")
      .select(
        "user_id, first_name, verification_status, reengagement_email_sent_at"
      )
      .in("user_id", candidateIds);

    type ProfileRow = {
      user_id: string;
      first_name: string | null;
      verification_status: string | null;
      reengagement_email_sent_at: string | null;
    };

    const profileByUser = new Map<string, ProfileRow>(
      (profiles ?? []).map((p) => [p.user_id as string, p as ProfileRow])
    );

    for (const u of users) {
      const email = u.email;
      if (!email) {
        skipped++;
        continue;
      }

      if (!isUserInactive(u, inactiveDays)) {
        skipped++;
        continue;
      }

      const row = profileByUser.get(u.id);
      if (!row) {
        skipped++;
        continue;
      }
      if (row.verification_status !== "verified") {
        skipped++;
        continue;
      }
      if (!canSendAgain(row.reengagement_email_sent_at, cooldownDays)) {
        skipped++;
        continue;
      }

      const ctx: ReengagementUserContext = {
        userId: u.id,
        email,
        firstName: row.first_name,
      };

      const html = buildReengagementEmailHtml(stats, ctx);

      const { error: sendErr } = await resend.emails.send({
        from,
        to: email,
        subject: "What you missed on EOD HUB",
        html,
      });

      if (sendErr) {
        errors++;
        continue;
      }

      const { error: updErr } = await admin
        .from("profiles")
        .update({ reengagement_email_sent_at: new Date().toISOString() })
        .eq("user_id", u.id);

      if (updErr) {
        errors++;
        continue;
      }
      sent++;
    }

    if (users.length < perPage) break;
    page++;
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    errors,
    inactiveDays,
    statsWindowDays,
    cooldownDays,
    stats,
  });
}
