import { type NextRequest } from "next/server";
import { promotionDb, promotionJson, PROMOTION_BUCKET } from "@/app/lib/server/promotionRequests";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return promotionJson({ error: "Unauthorized" }, 401);
  const db = promotionDb();
  const { error: claimError } = await db.rpc("expire_promotion_drafts");
  if (claimError) return promotionJson({ error: "Draft cleanup failed." }, 503);
  const { data, error } = await db.from("promotion_requests").select("id").eq("status", "expired").limit(100);
  if (error) return promotionJson({ error: "Draft cleanup failed." }, 503);
  let removed = 0;
  for (const draft of data ?? []) {
    // Listing the prefix also finds an upload interrupted before DB attachment.
    const { data: files, error: listError } = await db.storage.from(PROMOTION_BUCKET).list(draft.id, { limit: 100 });
    if (listError) continue;
    if (files?.length) {
      const { error: deleteError } = await db.storage.from(PROMOTION_BUCKET).remove(files.map(file => `${draft.id}/${file.name}`));
      if (deleteError) continue;
      if (files.length === 100) continue;
    }
    const { error: rowError } = await db.from("promotion_requests").delete().eq("id", draft.id).eq("status", "expired");
    if (!rowError) removed++;
  }
  return promotionJson({ removed });
}
