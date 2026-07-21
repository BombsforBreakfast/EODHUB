import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createNotification } from "../notificationsServer";
import {
  ARCADE_CREDITS_REFILL_EMAIL_SUBJECT,
  buildArcadeCreditsRefillArcadeUrl,
  buildArcadeCreditsRefillEmailHtml,
} from "../email/arcadeCreditsRefillEmail";

export const ARCADE_CREDITS_REFILL_MESSAGE = "Game Credits now full, go play!";
export const ARCADE_CREDITS_REFILL_LINK = "/games";
export const ARCADE_CREDITS_REFILL_TYPE = "arcade_credits_refilled";

export type ArcadeCreditsRefillResult = {
  reupped: number;
  notified: number;
  emailed: number;
  emailSkipped: number;
  errors: number;
};

function utcGrantDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function displayFirstName(row: {
  first_name?: string | null;
  display_name?: string | null;
}): string {
  const first = row.first_name?.trim();
  if (first) return first;
  const display = row.display_name?.trim();
  if (display) return display.split(/\s+/)[0] ?? "";
  return "";
}

async function sendArcadeCreditsRefillEmail(params: {
  to: string;
  firstName: string;
}): Promise<"sent" | "skipped_no_key" | "error"> {
  if (!process.env.RESEND_API_KEY) return "skipped_no_key";
  const arcadeUrl = buildArcadeCreditsRefillArcadeUrl();
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: params.to,
    subject: ARCADE_CREDITS_REFILL_EMAIL_SUBJECT,
    html: buildArcadeCreditsRefillEmailHtml({
      firstName: params.firstName || "there",
      arcadeUrl,
    }),
  });
  if (error) {
    console.error("[arcadeCreditsRefill] email failed", error);
    return "error";
  }
  return "sent";
}

/**
 * Apply UTC daily challenge-coin refills and notify only players who were
 * topped up from below the daily max (active spenders — not full wallets).
 */
export async function runArcadeCreditsDailyRefill(
  admin: SupabaseClient,
): Promise<ArcadeCreditsRefillResult> {
  const { data: reuppedRows, error: refillError } = await admin.rpc(
    "arcade_apply_daily_challenge_coin_refills",
  );

  if (refillError) {
    throw new Error(refillError.message);
  }

  const userIds = (reuppedRows ?? [])
    .map((row: { user_id?: string } | string) =>
      typeof row === "string" ? row : row.user_id,
    )
    .filter((id: string | undefined): id is string => Boolean(id));

  const result: ArcadeCreditsRefillResult = {
    reupped: userIds.length,
    notified: 0,
    emailed: 0,
    emailSkipped: 0,
    errors: 0,
  };

  if (userIds.length === 0) return result;

  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    admin
      .from("profiles")
      .select("user_id, email, first_name, display_name")
      .in("user_id", userIds),
    admin
      .from("notification_preferences")
      .select("user_id, email_notifications")
      .in("user_id", userIds),
  ]);

  const profileById = new Map(
    (profiles ?? []).map((p: {
      user_id: string;
      email: string | null;
      first_name: string | null;
      display_name: string | null;
    }) => [p.user_id, p]),
  );
  const emailEnabledById = new Map(
    (prefs ?? []).map((p: { user_id: string; email_notifications: boolean }) => [
      p.user_id,
      p.email_notifications !== false,
    ]),
  );

  const grantDate = utcGrantDateKey();

  for (const userId of userIds) {
    try {
      await createNotification(admin, {
        recipientUserId: userId,
        type: ARCADE_CREDITS_REFILL_TYPE,
        category: "system",
        title: "EOD Arcade",
        message: ARCADE_CREDITS_REFILL_MESSAGE,
        body: ARCADE_CREDITS_REFILL_MESSAGE,
        link: ARCADE_CREDITS_REFILL_LINK,
        dedupeKey: `arcade_credits_refilled:${userId}:${grantDate}`,
        metadata: { source: "daily_refill", grant_date: grantDate },
      });
      result.notified += 1;

      const profile = profileById.get(userId);
      const email = profile?.email?.trim();
      const emailAllowed = emailEnabledById.get(userId) ?? true;
      if (!email || !emailAllowed) {
        result.emailSkipped += 1;
        continue;
      }

      const emailResult = await sendArcadeCreditsRefillEmail({
        to: email,
        firstName: displayFirstName(profile ?? {}),
      });
      if (emailResult === "sent") result.emailed += 1;
      else result.emailSkipped += 1;
    } catch (err) {
      result.errors += 1;
      console.error("[arcadeCreditsRefill] notify failed", { userId, err });
    }
  }

  return result;
}
