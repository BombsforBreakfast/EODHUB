import { type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { promotionJson, PROMOTION_BUCKET } from "@/app/lib/server/promotionRequests";
import { PROMOTION_REVIEW_EMAIL, PROMOTION_STATUSES, type PromotionAttachment } from "@/app/lib/promotions";

const columns = "id,package,name,email,phone,business,promotion_type,description,destination,timing,status,admin_notes,attachments,created_at,submitted_at";
async function auth(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return { error: promotionJson({ error: access.error }, access.status) };
  if (access.user.email?.toLowerCase() !== PROMOTION_REVIEW_EMAIL) return { error: promotionJson({ error: "This queue belongs to the promotions administrator." }, 403) };
  return access;
}
export async function GET(request: NextRequest) {
  const access = await auth(request);
  if ("error" in access) return access.error;
  const id = request.nextUrl.searchParams.get("id");
  let query = access.admin.from("promotion_requests").select(columns).eq("recipient_id", access.user.id).in("status", [...PROMOTION_STATUSES]);
  if (id) {
    if (!z.uuid().safeParse(id).success) return promotionJson({ error: "Invalid request." }, 400);
    query = query.eq("id", id);
  }
  const status = request.nextUrl.searchParams.get("status");
  if (status && PROMOTION_STATUSES.includes(status as typeof PROMOTION_STATUSES[number])) query = query.eq("status", status);
  const { data, error } = await query.order("submitted_at", { ascending: false }).limit(id ? 1 : 100);
  if (error) return promotionJson({ error: "Could not load promotions." }, 503);
  const items = await Promise.all((data ?? []).map(async row => ({
    ...row,
    attachments: id ? await Promise.all((row.attachments as PromotionAttachment[]).map(async file => {
      const { data: signed } = await access.admin.storage.from(PROMOTION_BUCKET).createSignedUrl(file.path, 600);
      return { ...file, url: signed?.signedUrl ?? null };
    })) : [],
  })));
  return promotionJson({ items });
}
export async function PATCH(request: NextRequest) {
  const access = await auth(request);
  if ("error" in access) return access.error;
  try {
    const text = await request.text();
    if (text.length > 16000) throw new Error();
    const input = z.object({ id: z.uuid(), status: z.enum(PROMOTION_STATUSES), notes: z.string().max(12000) }).parse(JSON.parse(text));
    const { data, error } = await access.admin.from("promotion_requests").update({ status: input.status, admin_notes: input.notes, updated_at: new Date().toISOString() }).eq("id", input.id).eq("recipient_id", access.user.id).in("status", [...PROMOTION_STATUSES]).select("id").single();
    if (error || !data) return promotionJson({ error: "Could not save your changes." }, 503);
    return promotionJson({ ok: true });
  } catch { return promotionJson({ error: "Please check the status and notes." }, 400); }
}
