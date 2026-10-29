import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { rentalDatabase, rentalFailure, RentalError, checkDb } from "@/app/lib/rentals/portal.server";
import { listingHasPaidAccess } from "@/app/lib/rentals/provider";
export async function GET(request:NextRequest) {
  try {
    const id=z.uuid().parse(request.nextUrl.searchParams.get("property")), index=Number(request.nextUrl.searchParams.get("photo"));
    if (!Number.isInteger(index)||index<0||index>=100) throw new RentalError("Photo not found.",404);
    const db=rentalDatabase();
    const {data:row,error}=await db.from("rental_properties").select("*,provider:rental_providers!inner(status)").eq("id",id).eq("hidden",false).eq("provider.status","approved").maybeSingle();checkDb(error);
    if(!row?.published||!listingHasPaidAccess(row))throw new RentalError("Photo not found.",404);
    const path=row.published.photos?.[index];
    if(typeof path!=="string"||!path.startsWith(`${row.provider_id}/photos/`))throw new RentalError("Photo not found.",404);
    const signed=await db.storage.from("rental-assets").createSignedUrl(path,3600);checkDb(signed.error);
    if(!signed.data?.signedUrl)throw new RentalError("Photo not found.",404);
    return NextResponse.redirect(signed.data.signedUrl,{status:307,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return rentalFailure(error);}
}
