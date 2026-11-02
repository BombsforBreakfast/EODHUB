import { type NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin, OWNER_ADMIN_USER_ID } from "@/app/lib/ownerAdminAccess";
import { supportJson, supportStripe } from "@/app/lib/server/hubSupport";
import { createNotification } from "@/app/lib/notificationsServer";
import { checkRateLimit } from "@/app/lib/server/rateLimit";
import { withSupportContributors, supportSubscriberDetails } from "@/app/lib/server/hubSupportContributors";
import type { SupportSubscription } from "@/app/lib/hubSupportMonthly";
import { z } from "zod";
import { readLimitedBody } from "@/app/lib/server/promotionRequests";

export async function PATCH(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  try {
    const input = z.object({ incidentKey: z.string().min(1).max(250) }).strict().parse(JSON.parse((await readLimitedBody(request, 1024)).toString("utf8")));
    const result = await access.admin.from("hub_support_billing_issues").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("incident_key", input.incidentKey);
    if (result.error) throw Error();
    return supportJson({ ok: true });
  } catch { return supportJson({ error: "Could not mark the billing issue reviewed." }, 400); }
}

export async function GET(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  const { data, error } = await access.admin.from("hub_contributions").select("id,amount_cents,refunded_cents,disputed_cents,frequency,support_subscription_id,status,livemode,created_at,paid_at,checkout_session_id").not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(100);
  if (error) return supportJson({ error: "Could not load contributions." }, 503);
  const [subResult, issuesResult, mailResult] = await Promise.all([
    access.admin.from("hub_support_subscriptions").select("*").not("stripe_subscription_id", "is", null).order("created_at", { ascending: false }).limit(100),
    access.admin.from("hub_support_billing_issues").select("incident_key,kind,detail,stripe_object_id,created_at,support_subscription_id").eq("status", "open").order("created_at", { ascending: false }).limit(100),
    access.admin.from("hub_support_billing_emails").select("id", { count: "exact", head: true }).is("sent_at", null).eq("livemode", true),
  ]);
  if (subResult.error || issuesResult.error || mailResult.error) return supportJson({ error: "Could not load monthly support billing." }, 503);
  const config = (() => { try { return supportStripe(); } catch { return null; } })();
  const subscribers = [];
  const deadline = Date.now() + 8000;
  for (let start = 0; start < subResult.data.length; start += 5) {
    subscribers.push(...await Promise.all((subResult.data as SupportSubscription[]).slice(start, start + 5).map(async row => {
      let contact = null;
      if (config && Date.now() < deadline) try { contact = await supportSubscriberDetails(row, config); } catch { /* Ledger remains visible. */ }
      return { id: row.id, amount_cents: row.amount_cents, livemode: row.livemode, status: row.status, cancel_at_period_end: row.cancel_at_period_end, current_period_end: row.current_period_end, contributor_name: contact?.contributor_name ?? null, contributor_email: contact?.contributor_email ?? null };
    })));
  }
  return supportJson({ items: await withSupportContributors(data), subscribers, issues: issuesResult.data, pendingEmails: mailResult.count });
}

/** An owner-only delivery check; never creates a payment or accepts a recipient. */
export async function POST(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  const rate = checkRateLimit(`hub-support:test-alert:${OWNER_ADMIN_USER_ID}`, { limit: 1, windowMs: 60_000 });
  if (!rate.allowed) return supportJson({ error: "Please wait a minute before sending another test." }, 429);
  try {
    const delivery = await createNotification(access.admin, {
      recipientUserId: OWNER_ADMIN_USER_ID,
      type: "hub_contribution_test", category: "system", actorName: "Support the Hub",
      title: "Hub contribution alerts test",
      message: "Test only: Hub contribution alerts are enabled. No payment was made.",
      link: "/admin/hub-support",
      dedupeKey: `hub-support-test:${Math.floor(Date.now() / 60_000)}`,
    }, { waitForPush: true });
    const summary = (name: string, platform: NonNullable<typeof delivery>["ios"]) =>
      `${name}: ${!platform.configured ? "provider not configured" : !platform.registered ? "no registered devices" : `${platform.accepted} of ${platform.registered} devices accepted by provider`}${platform.failures.length ? ` (${platform.failures.join("; ")})` : ""}.`;
    const status = delivery?.skipped ? ` Push skipped: ${delivery.skipped.replaceAll("_", " ")}.` : "";
    const details = delivery ? ` ${summary("iPhone", delivery.ios)} ${summary("Android", delivery.android)}` : "";
    return supportJson({ message: `Test only; no payment was made.${status}${details} Provider acceptance does not confirm that the phone displayed it.`, delivery });
  } catch {
    return supportJson({ error: "Could not queue the test alert. Please try again." }, 503);
  }
}
