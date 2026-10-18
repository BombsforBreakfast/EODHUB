import { after, type NextRequest } from "next/server";
import { promotionAccess, promotionDb, promotionJson, readPromotionJson } from "@/app/lib/server/promotionRequests";
import { dispatchPushForNotification } from "@/app/lib/server/pushDispatch";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = promotionAccess(request);
  if (access.error) return access.error;
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return promotionJson({ error: "Invalid request." }, 400);
  try {
    const input = z.object({ imageCount: z.number().int().min(0).max(5) }).parse(await readPromotionJson(request, 1000));
    const db = promotionDb();
    const { data, error } = await db.rpc("submit_promotion_request", { p_id: id, p_owner: access.owner, p_image_count: input.imageCount });
    if (error || !data) { console.error("[promotion] submission failed", error?.code); return promotionJson({ error: "Your request has not been submitted. Please try again; your uploaded images are saved." }, 503); }
    if (!data.already) after(async () => {
      try {
        await dispatchPushForNotification(db, {
          recipientUserId: data.recipient_id, type: "promotion_request", title: "Promotion to review",
          body: "A new promotion request is ready in your admin queue.",
          link: `/admin/promotions?request=${id}`,
        }, data.notification_id);
      } catch (e) { console.error("[promotion] push dispatch failed", e instanceof Error ? e.name : "unknown"); }
    });
    return promotionJson({ ok: true, id });
  } catch { return promotionJson({ error: "Please try submitting your request again." }, 400); }
}
