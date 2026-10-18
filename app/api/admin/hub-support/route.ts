import { type NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin, OWNER_ADMIN_USER_ID } from "@/app/lib/ownerAdminAccess";
import { supportJson } from "@/app/lib/server/hubSupport";
import { createNotification } from "@/app/lib/notificationsServer";
import { checkRateLimit } from "@/app/lib/server/rateLimit";

export async function GET(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  const { data, error } = await access.admin.from("hub_contributions").select("id,amount_cents,refunded_cents,status,livemode,created_at,paid_at").order("created_at", { ascending: false }).limit(100);
  if (error) return supportJson({ error: "Could not load contributions." }, 503);
  return supportJson({ items: data });
}

/** An owner-only delivery check; never creates a payment or accepts a recipient. */
export async function POST(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  const rate = checkRateLimit(`hub-support:test-alert:${OWNER_ADMIN_USER_ID}`, { limit: 1, windowMs: 60_000 });
  if (!rate.allowed) return supportJson({ error: "Please wait a minute before sending another test." }, 429);
  try {
    await createNotification(access.admin, {
      recipientUserId: OWNER_ADMIN_USER_ID,
      type: "hub_contribution_test", category: "system", actorName: "Support the Hub",
      title: "Hub contribution alerts test",
      message: "Test only: Hub contribution alerts are enabled. No payment was made.",
      link: "/admin/hub-support",
      dedupeKey: `hub-support-test:${Math.floor(Date.now() / 60_000)}`,
    });
    return supportJson({ message: "Test alert queued for your account. Check your bell and registered devices; no payment was made." });
  } catch {
    return supportJson({ error: "Could not queue the test alert. Please try again." }, 503);
  }
}
