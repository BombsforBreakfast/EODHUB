import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMonthlyCommunityUpdateEmailHtml,
  MONTHLY_COMMUNITY_UPDATE_SUBJECT,
} from "../email/monthlyCommunityUpdateEmail";

export const INACTIVE_MEMBER_UPDATE_CAMPAIGN_KEY = "inactive-member-update-2026-07";
export const FOUNDER_AUDIT_EMAIL = "micheal.p.twigg@gmail.com";
const SEND_DELAY_MS = 150;

export type EmailCampaignBatchRow = {
  id: string;
  campaign_key: string;
  batch_number: number;
  scheduled_for: string;
  recipients: string[];
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  failed_recipients: string[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function splitRecipientsIntoBatches(
  recipients: string[],
  batchSizes: number[],
  founderEmail = FOUNDER_AUDIT_EMAIL,
): string[][] {
  const normalized = [...new Set(recipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const founder = founderEmail.trim().toLowerCase();
  const withoutFounder = normalized.filter((email) => email !== founder);
  const ordered = normalized.includes(founder) ? [founder, ...withoutFounder] : withoutFounder;

  const batches: string[][] = [];
  let offset = 0;
  for (const size of batchSizes) {
    batches.push(ordered.slice(offset, offset + size));
    offset += size;
  }
  if (offset < ordered.length) {
    batches.push(ordered.slice(offset));
  }
  return batches.filter((batch) => batch.length > 0);
}

export async function fetchDueCampaignBatch(
  adminClient: SupabaseClient,
  campaignKey: string,
  asOf = new Date(),
): Promise<EmailCampaignBatchRow | null> {
  const today = asOf.toISOString().slice(0, 10);
  const { data, error } = await adminClient
    .from("email_campaign_batches")
    .select("*")
    .eq("campaign_key", campaignKey)
    .is("sent_at", null)
    .lte("scheduled_for", today)
    .order("batch_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as EmailCampaignBatchRow | null) ?? null;
}

export async function sendInactiveMemberUpdateBatch(params: {
  recipients: string[];
  origin: string;
  resendApiKey: string;
  fromEmail: string;
  dryRun?: boolean;
}): Promise<{ sent: number; failed: number; failedRecipients: string[] }> {
  if (params.dryRun) {
    return { sent: params.recipients.length, failed: 0, failedRecipients: [] };
  }

  const resend = new Resend(params.resendApiKey);
  const html = buildMonthlyCommunityUpdateEmailHtml(params.origin);
  let sent = 0;
  let failed = 0;
  const failedRecipients: string[] = [];

  for (const email of params.recipients) {
    const { error } = await resend.emails.send({
      from: params.fromEmail,
      to: email,
      subject: MONTHLY_COMMUNITY_UPDATE_SUBJECT,
      html,
    });

    if (error) {
      failed += 1;
      failedRecipients.push(email);
    } else {
      sent += 1;
    }

    await sleep(SEND_DELAY_MS);
  }

  return { sent, failed, failedRecipients };
}

export async function markCampaignBatchResult(
  adminClient: SupabaseClient,
  batchId: string,
  result: { sent: number; failed: number; failedRecipients: string[] },
) {
  const { error } = await adminClient
    .from("email_campaign_batches")
    .update({
      sent_at: new Date().toISOString(),
      sent_count: result.sent,
      failed_count: result.failed,
      failed_recipients: result.failedRecipients,
    })
    .eq("id", batchId);

  if (error) throw new Error(error.message);
}
