import { type NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin } from "@/app/lib/ownerAdminAccess";
import { supportJson } from "@/app/lib/server/hubSupport";

export async function GET(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return supportJson({ error: access.error }, access.status);
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return supportJson({ error: "Forbidden" }, 403);
  const { data, error } = await access.admin.from("hub_contributions").select("id,amount_cents,refunded_cents,status,livemode,created_at,paid_at").order("created_at", { ascending: false }).limit(100);
  if (error) return supportJson({ error: "Could not load contributions." }, 503);
  return supportJson({ items: data });
}
