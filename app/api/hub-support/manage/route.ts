import type { NextRequest } from "next/server";
import { z } from "zod";
import { supportDb, supportGuard, supportJson, supportReturnOrigin, supportSource, supportStripe } from "@/app/lib/server/hubSupport";
import { readLimitedBody } from "@/app/lib/server/promotionRequests";
import { signSupportManagement, supportEmailHash, verifySupportManagement } from "@/app/lib/server/hubSupportManagement";
import { sendSupportEmail } from "@/app/lib/server/hubSupportEmail";
import { syncSupportSubscription } from "@/app/lib/server/hubSupportSubscriptions";
import { validSupportPortal } from "@/app/lib/hubSupportMonthly";

const inputSchema = z.union([
  z.object({ email: z.email().max(254) }).strict(),
  z.object({ token: z.string().min(80).max(1200) }).strict(),
]);
const generic = { message: "If that email has monthly Hub support, a secure management link will arrive shortly. Check spam, or contact hello@eod-hub.com if you need help." };
export async function POST(request: NextRequest) {
  const denied = supportGuard(request, true);
  if (denied) return denied;
  let input: z.infer<typeof inputSchema>;
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw Error();
    input = inputSchema.parse(JSON.parse((await readLimitedBody(request, 2048)).toString("utf8")));
  } catch { return supportJson({ error: "Enter the email you used at checkout, or request a fresh management link." }, 400); }
  try {
    const db = supportDb(), { stripe, live } = supportStripe(), origin = supportReturnOrigin(request);
    if ("email" in input) {
      const email = input.email.trim().toLowerCase(), hash = supportEmailHash(email);
      const quota = await db.rpc("hub_support_management_quota", { p_email: hash, p_source: supportSource(request) });
      if (quota.error) throw Error("Management quota unavailable");
      if (!quota.data) return supportJson(generic);
      const rows = await db.from("hub_support_subscriptions").select("id,stripe_subscription_id").eq("email_hash", hash).eq("livemode", live).not("stripe_subscription_id", "is", null).order("created_at", { ascending: false }).limit(21);
      if (rows.error) throw Error("Management lookup unavailable");
      // Bound email work; an unusual account is handled by Support directly.
      if ((rows.data?.length ?? 0) > 20) {
        await sendSupportEmail({ recipient: email, subject: "Manage your monthly support", message: "Please contact hello@eod-hub.com so we can help manage your monthly support subscriptions.", link: `${origin}/support-the-hub/manage`, livemode: live }, `support-manage-assist:${hash}:${Math.floor(Date.now()/60000)}`);
      } else for (const match of rows.data ?? []) {
        const synced = await syncSupportSubscription({ db, stripe, live }, match.stripe_subscription_id!);
        if (!synced || synced.row.email_hash !== hash || synced.row.id !== match.id) continue;
        const token = signSupportManagement(match.id, hash, live);
        await sendSupportEmail({ recipient: email, subject: "Your secure monthly support link", message: "Use this secure link to view invoices, update your payment method, or cancel future monthly support renewals. The link expires in one hour. If you support the Hub more than once, each subscription has its own link.\nIf you did not request this, you can ignore this email.", link: `${origin}/support-the-hub/manage#token=${token}`, livemode: live }, `support-manage:${match.id}:${Math.floor(Date.now()/60000)}`);
      }
      return supportJson(generic);
    }
    const claims = verifySupportManagement(input.token, live);
    if (!claims) return supportJson({ error: "This management link has expired or is invalid. Request a fresh link below." }, 401);
    const result = await db.from("hub_support_subscriptions").select("stripe_subscription_id").eq("id", claims.id).eq("livemode", live).single();
    if (result.error || !result.data?.stripe_subscription_id) return supportJson({ error: "Request a fresh management link below." }, 401);
    const synced = await syncSupportSubscription({ db, stripe, live }, result.data.stripe_subscription_id);
    if (!synced || synced.row.id !== claims.id || synced.row.email_hash !== claims.email) return supportJson({ error: "Your support email has changed. Request a fresh link using the current email." }, 401);
    const subscriptions = await stripe.subscriptions.list({ customer: synced.customer.id, status: "all", limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some(s => s.id !== synced.subscription.id)) throw Error("Support customer is not isolated");
    const configuration = process.env.STRIPE_SUPPORT_PORTAL_CONFIGURATION_ID;
    if (!configuration?.startsWith("bpc_")) throw Error("Support portal unavailable");
    if (!validSupportPortal(await stripe.billingPortal.configurations.retrieve(configuration))) throw Error("Unsafe support portal configuration");
    const portal = await stripe.billingPortal.sessions.create({ customer: synced.customer.id, configuration, return_url: `${origin}/support-the-hub/manage?returned=1` });
    if (new URL(portal.url).hostname !== "billing.stripe.com") throw Error("Invalid support portal");
    return supportJson({ url: portal.url });
  } catch {
    console.error("[hub-support] management unavailable");
    if ("email" in input) return supportJson(generic);
    return supportJson({ error: "We could not open billing. Request a fresh link, or contact hello@eod-hub.com." }, 503);
  }
}
