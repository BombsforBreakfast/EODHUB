import type { NextRequest } from "next/server";
import { z } from "zod";
import { rentalAdministrator,rentalBody,rentalJson,rentalFailure,ensureSameOrigin,checkDb,RentalError } from "@/app/lib/rentals/portal.server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  try{
    const{db}=await rentalAdministrator(request);
    if(request.nextUrl.searchParams.get("count")==="1"){
      const count=await db.from("rental_listing_flags").select("id",{count:"exact",head:true}).in("status",["open","reviewing"]);checkDb(count.error);return rentalJson({active:count.count??0});
    }
    const filter=z.enum(["active","all"]).parse(request.nextUrl.searchParams.get("filter")??"active");
    const page=z.coerce.number().int().min(0).max(10000).parse(request.nextUrl.searchParams.get("page")??0);
    let query=db.from("rental_listing_flags").select("*",{count:"exact"});
    if(filter==="active")query=query.in("status",["open","reviewing"]);
    const flags=await query.order("created_at",{ascending:false}).order("id").range(page*25,page*25+24);checkDb(flags.error);
    const ids=[...new Set((flags.data??[]).map(p=>p.listing_id))];
    const moderation=ids.length?await db.from("rental_listing_moderation").select("listing_id,hidden,reason,revision,permanent").in("listing_id",ids):{data:[],error:null};checkDb(moderation.error);
    const pending=await db.from("rental_listing_flags").select("id",{count:"exact",head:true}).in("status",["open","reviewing"]);checkDb(pending.error);
    return rentalJson({flags:flags.data,moderation:moderation.data,total:flags.count??0,active:pending.count??0,page});
  }catch(error){return rentalFailure(error);}
}
export async function PATCH(request:NextRequest){
  try{
    ensureSameOrigin(request);const{db,user}=await rentalAdministrator(request);
    const body=await rentalBody(request,6000),id=z.uuid().parse(body.id),note=z.string().trim().min(5,"Add a short review note.").max(2000).parse(body.note);
    const flag=await db.from("rental_listing_flags").select("listing_id").eq("id",id).maybeSingle();checkDb(flag.error);if(!flag.data)throw new RentalError("Report not found.",404);
    if(body.action==="visibility"){
      const result=await db.rpc("rental_set_moderation",{p_listing:flag.data.listing_id,p_hidden:z.boolean().parse(body.hidden),p_note:note,p_admin:user.id,p_revision:z.number().int().min(0).parse(body.revision)});checkDb(result.error);
      if(!result.data)throw new RentalError("Listing visibility changed in another window. Refresh before saving.",409);
    }else if(body.action==="review"){
      const result=await db.from("rental_listing_flags").update({status:z.enum(["open","reviewing","resolved","dismissed"]).parse(body.status),review_note:note,reviewed_at:new Date().toISOString(),reviewed_by:user.id,revision:z.number().int().positive().parse(body.revision)+1}).eq("id",id).eq("revision",body.revision).select("id");checkDb(result.error);
      if(result.data?.length!==1)throw new RentalError("This report changed in another window. Refresh before saving.",409);
    }else throw new RentalError("Unknown review action.");
    return rentalJson({ok:true});
  }catch(error){return rentalFailure(error);}
}
