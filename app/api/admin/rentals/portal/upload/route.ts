import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { rentalAdministrator, rentalFailure, rentalJson, ensureSameOrigin, RentalError, checkDb } from "@/app/lib/rentals/portal.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const { db } = await rentalAdministrator(request);
    if (Number(request.headers.get("content-length")) > 4200000) throw new RentalError("Use a file under 4 MB.",413);
    const form = await request.formData(), file = form.get("file"), kind = form.get("kind"), id = form.get("campaignId");
    if (!(file instanceof File) || file.size > 4000000 || !["flyer","report"].includes(String(kind)) || typeof id !== "string") throw new RentalError("Choose a flyer or report under 4 MB.");
    const { data: campaign } = await db.from("rental_campaigns").select("id,provider_id").eq("id",id).maybeSingle();
    if (!campaign) throw new RentalError("Campaign not found.",404);
    let bytes:Buffer = Buffer.from(await file.arrayBuffer()), ext: string, type: string;
    if (kind === "report" && file.type === "application/pdf" && bytes.subarray(0,5).toString() === "%PDF-") { ext="pdf"; type="application/pdf"; }
    else if (["image/jpeg","image/png","image/webp"].includes(file.type)) { bytes=await sharp(bytes,{limitInputPixels:30000000}).rotate().resize({width:1800,height:1800,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer(); ext="webp"; type="image/webp"; }
    else throw new RentalError("Use an image for flyers, or an image/PDF for reports.");
    const path=`${campaign.provider_id}/${kind}/${randomUUID()}.${ext}`;
    checkDb((await db.storage.from("rental-assets").upload(path,bytes,{contentType:type,upsert:false})).error);
    checkDb((await db.from("rental_campaigns").update({[kind === "flyer" ? "flyer_path" : "report_path"]:path}).eq("id",id)).error);
    return rentalJson({ok:true});
  } catch(error) { return rentalFailure(error); }
}
