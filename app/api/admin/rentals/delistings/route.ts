import type {NextRequest} from "next/server";
import {z} from "zod";
import {rentalAdministrator,rentalBody,rentalJson,rentalFailure,ensureSameOrigin,checkDb,RentalError} from "@/app/lib/rentals/portal.server";
import {confirmDelisting,processDelisting} from "@/app/lib/rentals/delisting.server";
import type {Delisting} from "@/app/lib/rentals/delisting";
import {queueBillingEmail,drainBillingEmails} from "@/app/lib/rentals/billing-notifications.server";
import {rentalListings as rentals} from "@/app/lib/rentals/listings.server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
  try{
    const{db}=await rentalAdministrator(request);
    const page=z.coerce.number().int().min(0).max(10000).parse(request.nextUrl.searchParams.get("page")??0);
    const [jobs,providers,properties]=await Promise.all([
      db.from("rental_delistings").select("*",{count:"exact"}).order("effective_at",{ascending:false}).order("id").range(page*25,page*25+24),
      db.from("rental_providers").select("user_id,full_name,company,delisted_at").order("full_name").limit(1000),
      db.from("rental_properties").select("id,provider_id,draft,published,delisted_at").order("created_at",{ascending:false}).limit(1000)
    ]);checkDb(jobs.error);checkDb(providers.error);checkDb(properties.error);
    return rentalJson({jobs:jobs.data,total:jobs.count,page,providers:providers.data,properties:[...rentals.map(p=>({id:p.id,provider_id:p.ownerId,label:p.address})),...(properties.data??[]).map(p=>({id:p.id,provider_id:p.provider_id,label:p.published?.address||p.draft?.address||"Untitled property",delisted_at:p.delisted_at}))]});
  }catch(e){return rentalFailure(e);}
}
export async function POST(request:NextRequest){
  try{
    ensureSameOrigin(request);const{db,user}=await rentalAdministrator(request),body=await rentalBody(request,6000);
    if(body.action==="confirm"){
      if(body.confirm!==true)throw new RentalError("Confirm permanent delisting and the billing policy.");
      const scope=z.enum(["property","provider"]).parse(body.scope),target=z.string().min(1).max(100).parse(body.target),note=z.string().trim().min(5).max(2000).parse(body.note);
      const legacy=scope==="property"?rentals.find(p=>p.id===target):undefined;
      if(!legacy)z.uuid().parse(target);
      await confirmDelisting(db,scope,target,note,user.id,legacy?{ownerId:legacy.ownerId,address:legacy.address}:undefined);
    }else{
      const id=z.uuid().parse(body.id),result=await db.from("rental_delistings").select("*").eq("id",id).single();checkDb(result.error);const job=result.data as Delisting;
      if(!job)throw new RentalError("Delisting not found.",404);
      if(body.action==="retry")await processDelisting(db,job);
      else if(body.action==="record_refund"){
        if(job.state==="pending")throw new RentalError("Finish subscription cancellation before recording a refund.");
        const amount=z.number().int().nonnegative().max(10000000).parse(body.cents),reference=z.string().max(100).parse(body.reference??""),note=z.string().trim().min(5).max(2000).parse(body.note);
        if(body.reviewed!==true)throw new RentalError("Verify the actual cash refund and earlier adjustments in Stripe first.");
        if(amount>0&&!/^re_[A-Za-z0-9]+$/.test(reference))throw new RentalError("Record Stripe’s cash refund ID (re_…).");
        if(job.plan==="monthly"&&amount>0)throw new RentalError("Monthly delisting retains the current paid month. Review exceptional refunds separately.");
        if(job.refund_cents!==null&&amount>job.refund_cents)throw new RentalError("The refund exceeds the calculated unused annual balance. Review adjusted invoices in Stripe before proceeding.");
        if(job.state==="completed"&&(job.refund_id!==(reference||null)||job.refunded_cents!==amount))throw new RentalError("This task is already completed.",409);
        const update=await db.from("rental_delistings").update({state:"completed",refunded_cents:amount,refund_id:reference||null,result_note:note,refund_recorded_by:user.id,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).eq("state",job.state).select("id");checkDb(update.error);if(update.data?.length!==1)throw new RentalError("The refund task changed. Refresh before saving.",409);
        if(job.plan!=="legacy"){
          const provider=await db.from("rental_providers").select("email").eq("user_id",job.provider_id).single();checkDb(provider.error);
          if(provider.data)await queueBillingEmail(db,`delisted:${id}:refund-recorded`,provider.data.email,"Delisting refund review completed",`${job.label}\n\n${amount>0?`Your unused annual listing refund of $${(amount/100).toFixed(2)} has been issued through Stripe. Refund reference: ${reference}. Your bank determines when the credit appears.`:"The delisting billing review is complete; no further refund is due."}\n\n${note}\n\nFuture listing renewal remains off.`);
        }
      }else throw new RentalError("Unknown delisting action.");
    }
    await drainBillingEmails(db);return rentalJson({ok:true});
  }catch(e){return rentalFailure(e);}
}
