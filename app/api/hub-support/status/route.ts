import { type NextRequest } from "next/server";
import { supportDb, supportGuard, supportJson } from "@/app/lib/server/hubSupport";

export async function GET(request: NextRequest) {
  const denied = supportGuard(request);
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("session_id") ?? "";
  if (!/^cs_(test_|live_)?[a-zA-Z0-9]{20,250}$/.test(id)) return supportJson({ error: "Invalid checkout reference." }, 400);
  try {
    // The opaque Stripe session ID permits only a minimal, non-personal receipt.
    const { data, error } = await supportDb().from("hub_contributions").select("amount_cents,currency,status,frequency").eq("checkout_session_id", id).maybeSingle();
    if (error) throw error;
    if (!data) return supportJson({ error: "Payment confirmation is not available yet." }, 404);
    return supportJson(data);
  } catch { return supportJson({ error: "We could not check the payment yet. Please check your Stripe receipt before trying again." }, 503); }
}
