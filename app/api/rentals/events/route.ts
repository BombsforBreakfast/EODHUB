import type { NextRequest } from "next/server";
import { z } from "zod";
import { rentalDatabase,rentalBody,rentalLimit,rentalFailure,rentalJson,ensureSameOrigin,checkDb } from "@/app/lib/rentals/portal.server";
export async function POST(request:NextRequest) {
  try{
    ensureSameOrigin(request);
    const db=rentalDatabase();await rentalLimit(db,request,"rental-metrics",200,60);
    const body=z.object({ids:z.array(z.uuid()).min(1).max(50),kind:z.enum(["view","contact"])}).parse(await rentalBody(request,5000));
    for(const id of new Set(body.ids))checkDb((await db.rpc("rental_record_metric",{p_id:id,p_kind:body.kind})).error);
    return rentalJson({ok:true});
  }catch(error){return rentalFailure(error);}
}
