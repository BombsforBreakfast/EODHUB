import { type NextRequest } from "next/server";
import { promotionInput, PROMOTION_REVIEW_EMAIL } from "@/app/lib/promotions";
import { promotionAccess, promotionClientIp, promotionDb, promotionJson, readPromotionJson } from "@/app/lib/server/promotionRequests";
import { promotionSource } from "@/app/lib/server/promotionSession";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const access = promotionAccess(request);
  if (access.error) return access.error;
  try {
    const parsed = promotionInput.safeParse(await readPromotionJson(request));
    if (!parsed.success) return promotionJson({ error: parsed.error.issues[0]?.message ?? "Please check the form." }, 400);
    const db = promotionDb();
    const { data: reviewer, error: reviewerError } = await db.from("profiles").select("user_id").ilike("email", PROMOTION_REVIEW_EMAIL).eq("is_admin", true).single();
    if (reviewerError || !reviewer) return promotionJson({ error: "Our review desk is temporarily unavailable. Your form has not been submitted. Please try again later." }, 503);
    const { data, error } = await db.rpc("start_public_promotion_request", {
      p_id: parsed.data.id, p_owner: access.owner, p_recipient: reviewer.user_id, p_input: parsed.data,
      p_source: promotionSource(promotionClientIp(request), process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""),
    });
    if (error) {
      if (error.code === "PPR01") return promotionJson({ error: "The daily request limit has been reached for this connection. Please try again tomorrow or contact promote@eod-hub.com." }, 429);
      console.error("[promotion] draft creation failed", error.code);
      return promotionJson({ error: "We could not save your request. Please try again." }, 503);
    }
    return promotionJson({ id: data });
  } catch (e) { return promotionJson({ error: e instanceof SyntaxError ? "Please check the form." : "We could not save your request. Please try again." }, 400); }
}
