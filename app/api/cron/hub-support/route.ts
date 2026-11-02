import type { NextRequest } from "next/server";
import { supportDb, supportJson, supportStripe } from "@/app/lib/server/hubSupport";
import { drainSupportEmails } from "@/app/lib/server/hubSupportEmail";
import { notifySupportState, recordSupportInvoice, syncSupportSubscription } from "@/app/lib/server/hubSupportSubscriptions";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return supportJson({ error: "Unauthorized" }, 401);
  try {
    const db = supportDb(), { stripe, live } = supportStripe();
    if (request.nextUrl.searchParams.get("check") === "1") {
      const tables = await Promise.all(["hub_support_subscriptions", "hub_support_billing_emails", "hub_support_billing_issues"].map(table => db.from(table).select("*", { head: true, count: "exact" })));
      const permissions: Record<string, boolean> = {};
      for (const [key, check] of Object.entries({ customers: () => stripe.customers.list({ limit: 1 }), subscriptions: () => stripe.subscriptions.list({ limit: 1 }), invoices: () => stripe.invoices.list({ limit: 1 }), invoicePayments: () => stripe.invoicePayments.list({ limit: 1 }), portal: () => stripe.billingPortal.configurations.retrieve(process.env.STRIPE_SUPPORT_PORTAL_CONFIGURATION_ID || "bpc_unconfigured"), products: () => stripe.products.retrieve(process.env.STRIPE_SUPPORT_MONTHLY_PRODUCT_ID || "prod_unconfigured") })) {
        try { await check(); permissions[key] = true; } catch { permissions[key] = false; }
      }
      return supportJson({ databaseReady: tables.every(r => !r.error), live, permissions });
    }
    // Stable rotation prevents an unhealthy subscription starving later records.
    const rows = await db.from("hub_support_subscriptions").select("id,stripe_subscription_id").eq("livemode", live).not("stripe_subscription_id", "is", null).order("updated_at").limit(15);
    if (rows.error) throw Error("Support sweep unavailable");
    let failed = 0;
    for (const row of rows.data ?? []) try {
      const current = await syncSupportSubscription({ db, stripe, live }, row.stripe_subscription_id);
      if (!current) continue;
      await notifySupportState({ db, stripe, live }, current);
      const latest = current.subscription.latest_invoice;
      const invoiceId = typeof latest === "string" ? latest : latest?.id;
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        if (invoice.status === "paid" || (invoice.status === "open" && invoice.attempt_count > 0)) await recordSupportInvoice({ db, stripe, live }, invoice, `support-reconcile:${invoice.id}:${invoice.status}`, invoice.status === "paid" ? "paid" : "failed", Math.floor(Date.now()/1000));
      }
    } catch {
      failed++; console.error("[hub-support] reconciliation deferred", row.id);
      const rotated = await db.from("hub_support_subscriptions").update({updated_at: new Date().toISOString()}).eq("id", row.id);
      if (rotated.error) throw Error("Could not rotate support reconciliation");
    }
    const delivery = await drainSupportEmails(db, live);
    // Keep the dedupe key after removing delivery content; a later webhook
    // replay must never resend an old receipt after retention cleanup.
    const purge = await db.from("hub_support_billing_emails").update({ recipient: "", subject: "", message: "", link: "" }).lt("sent_at", new Date(Date.now()-30*86400000).toISOString()).neq("recipient", "");
    if (purge.error) throw Error("Support retention sweep failed");
    return supportJson({ ok: failed === 0, checked: rows.data?.length ?? 0, failed, delivery }, failed ? 503 : 200);
  } catch { return supportJson({ error: "Support sweep failed; queued work will retry." }, 503); }
}
