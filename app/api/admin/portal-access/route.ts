import type { NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin } from "@/app/lib/ownerAdminAccess";
import { accountBody,accountFailure,accountJson,accountWrite,AccountError,checkAccountDb,sharedAuthEnabled } from "@/app/lib/account/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function administrator(request:NextRequest){
  if(!sharedAuthEnabled())throw new AccountError("Not found.",404);
  const actor=await authenticateAdminApiRequest(request);if(!actor.ok)throw new AccountError(actor.error,actor.status);
  if(!isOwnerAdmin({userId:actor.user.id,email:actor.user.email,isAdmin:true}))throw new AccountError("Only the Hub owner can review portal access.",403);
  return actor;
}
export async function GET(request:NextRequest){try{
  const actor=await administrator(request),db=actor.admin;
  const [events,merges]=await Promise.all([db.from("portal_access_requests").select("*").eq("portal","event_organizer").order("requested_at",{ascending:false}).limit(100),db.from("portal_merge_requests").select("id,requested_by,other_user_id,other_verified_at,status,created_at,review_note").eq("status","pending_review").order("created_at",{ascending:false}).limit(100)]);[events,merges].forEach(result=>checkAccountDb(result.error));
  const ids=[...new Set([...(events.data??[]).map(row=>row.user_id),...(merges.data??[]).flatMap(row=>[row.requested_by,row.other_user_id])])];
  const users=Object.fromEntries(await Promise.all(ids.map(async id=>[id,(await db.auth.admin.getUserById(id)).data.user?.email??"Unavailable identity"])));
  return accountJson({events:events.data,merges:merges.data,users});
}catch(error){return accountFailure(error);}}
export async function POST(request:NextRequest){try{
  accountWrite(request);const actor=await administrator(request),body=await accountBody(request,5000),db=actor.admin;
  if(body.action==="review-organizer"){
    if(!/^[0-9a-f-]{36}$/.test(String(body.userId))||!["approved","rejected","suspended"].includes(String(body.decision)))throw new AccountError("Choose an account and decision.");
    checkAccountDb((await db.rpc("portal_review_organizer",{p_actor:actor.user.id,p_user:body.userId,p_decision:body.decision,p_note:typeof body.note==="string"?body.note.slice(0,1500):""})).error);
    return accountJson({ok:true});
  }
  if(body.action==="review-merge"){
    if(!/^[0-9a-f-]{36}$/.test(String(body.id))||!["pending_review","rejected"].includes(String(body.decision))||typeof body.note!=="string"||body.note.trim().length<3)throw new AccountError("Add a review note and decision.");
    const saved=await db.from("portal_merge_requests").update({status:body.decision,review_note:body.note.trim().slice(0,1500),reviewed_by:actor.user.id,reviewed_at:new Date().toISOString()}).eq("id",body.id).eq("status","pending_review").not("other_verified_at","is",null).select("id");checkAccountDb(saved.error);if(!saved.data?.length)throw new AccountError("Reload this request before reviewing it.",409);
    return accountJson({ok:true});
  }
  throw new AccountError("Unknown review action.");
}catch(error){return accountFailure(error);}}
