import type { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { rentalDatabase,rentalBody,rentalLimit,rentalFailure,rentalJson,ensureSameOrigin,checkDb } from "@/app/lib/rentals/portal.server";
import { engagementKinds } from "@/app/lib/rentals/analytics";
import { engagementOwner } from "@/app/lib/rentals/analytics.server";
export async function POST(request:NextRequest) {
  try{
    ensureSameOrigin(request);
    const db=rentalDatabase();await rentalLimit(db,request,"rental-metrics",200,60);
    // Ignore obvious automated crawlers; public engagement is directional, not proof of a person.
    if (/bot|crawler|spider|headless/i.test(request.headers.get("user-agent") ?? "")) return rentalJson({ok:true});
    const raw=await rentalBody(request,5000);
    const old=z.object({ids:z.array(z.uuid()).min(1).max(50),kind:z.enum(["view","contact"])}).safeParse(raw);
    const events=old.success?[...new Set(old.data.ids)].map(id=>({subject:"property" as const,id,kind:old.data.kind==="view"?"impression" as const:"contact_open" as const,eventId:randomUUID()})):[z.object({subject:z.enum(["property","advertiser"]),id:z.string().min(1).max(100),kind:z.enum(engagementKinds),eventId:z.uuid()}).parse(raw)];
    for(const event of events){
      if(event.subject==="advertiser"?!["impression","ad_click"].includes(event.kind):event.kind==="ad_click")continue;
      const owner=await engagementOwner(db,event.subject,event.id);if(!owner)continue;
      checkDb((await db.rpc("rental_record_engagement",{p_subject:event.subject,p_id:event.id,p_owner:owner,p_kind:event.kind,p_event:event.eventId})).error);
    }
    return rentalJson({ok:true});
  }catch(error){return rentalFailure(error);}
}
