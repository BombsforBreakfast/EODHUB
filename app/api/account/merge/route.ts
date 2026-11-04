import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { accountActor,accountBody,accountDatabase,accountFailure,accountJson,accountWrite,AccountError,checkAccountDb,sharedAuthEnabled,requireSharedSchema } from "@/app/lib/account/server";
import { findAuthUsersByEmail } from "@/app/lib/auth/adminAuthLookup";
import { accountEmail,accountAdminEmail } from "@/app/lib/account/mail.server";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
  if(!sharedAuthEnabled())throw new AccountError("Not found.",404);
  const {db,user}=await accountActor(request),result=await db.from("portal_merge_requests").select("id,status,other_verified_at,created_at,review_note").eq("requested_by",user.id).order("created_at",{ascending:false}).limit(10);checkAccountDb(result.error);
  return accountJson({requests:result.data});
}catch(error){return accountFailure(error);}}
export async function POST(request:NextRequest){try{
  if(!sharedAuthEnabled())throw new AccountError("Not found.",404);
  accountWrite(request);const body=await accountBody(request,3000),db=accountDatabase();
  await requireSharedSchema(db);
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]??"local";
  const limit=await db.rpc("rental_consume_limit",{p_key:`merge-ip:${digest(ip)}`,p_limit:10,p_seconds:3600});checkAccountDb(limit.error);if(!limit.data)throw new AccountError("Too many attempts. Try again later.",429);
  if(body.action==="verify"){
    const token=typeof body.token==="string"?body.token:"";
    if(!/^[a-zA-Z0-9_-]{32,200}$/.test(token)||! /^[0-9a-f-]{36}$/.test(String(body.id)))throw new AccountError("This verification link is invalid or expired.");
    const row=await db.from("portal_merge_requests").select("id,other_user_id,status,proof_expires_at").eq("id",body.id).eq("proof_digest",digest(token)).maybeSingle();checkAccountDb(row.error);
    if(!row.data || row.data.status!=="awaiting_verification" || Date.parse(row.data.proof_expires_at)<=Date.now())throw new AccountError("This verification link is invalid or expired.");
    const verifier=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
    const proof=await verifier.auth.verifyOtp({type:"email",token_hash:token});
    if(proof.error || !proof.data.user || proof.data.user.id!==row.data.other_user_id || !proof.data.user.email_confirmed_at)throw new AccountError("This verification link is invalid or expired.");
    await verifier.auth.signOut({scope:"local"});
    const saved=await db.from("portal_merge_requests").update({status:"pending_review",other_verified_at:new Date().toISOString()}).eq("id",row.data.id).eq("status","awaiting_verification").gt("proof_expires_at",new Date().toISOString()).select("id");checkAccountDb(saved.error);
    if(!saved.data?.length)throw new AccountError("This request is no longer awaiting verification.");
    await accountAdminEmail("Account merge ready for review","Both account identities have been verified for a shared-account merge request. Review in Admin → Portal access. No permissions or records have moved automatically.");
    return accountJson({ok:true,message:"Both identities are verified. Your merge request is ready for administrator review. Your existing accounts remain available during review."});
  }
  const actor=await accountActor(request);
  const actorLimit=await db.rpc("rental_consume_limit",{p_key:`merge-user:${actor.user.id}`,p_limit:3,p_seconds:3600});checkAccountDb(actorLimit.error);if(!actorLimit.data)throw new AccountError("Please wait before requesting another merge verification.",429);
  if(!actor.emailVerified)throw new AccountError("Verify your current sign-in first.",403);
  if(body.action!=="request")throw new AccountError("Unknown account action.");
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new AccountError("Enter the other account's sign-in email.");
  const generic={ok:true,message:"If that address belongs to another account, a verification link has been sent there. Administrator review follows verification of both identities."};
  const found=await findAuthUsersByEmail(db,email);
  if(found.listError)throw new AccountError("Could not prepare verification.",503);
  if(found.users.length!==1 || found.users[0].id===actor.user.id)return accountJson(generic);
  const other=found.users[0] as typeof found.users[0]&{banned_until?:string};
  if(other.banned_until&&Date.parse(other.banned_until)>Date.now())return accountJson(generic);
  const link=await db.auth.admin.generateLink({type:"magiclink",email});
  if(link.error||!link.data.properties?.hashed_token||link.data.user.id!==other.id)throw new AccountError("Could not prepare verification.",503);
  const token=link.data.properties.hashed_token;
  const row=await db.from("portal_merge_requests").insert({requested_by:actor.user.id,other_user_id:other.id,proof_digest:digest(token),proof_expires_at:new Date(Date.now()+30*60000).toISOString()}).select("id").single();checkAccountDb(row.error);
  const url=`${new URL(request.url).origin}/account/merge#request=${row.data!.id}&token_hash=${encodeURIComponent(token)}`;
  if(!await accountEmail(email,"Verify your account merge request","Someone signed in to EOD-HUB requested to combine their account with this one. Open this link only if you requested that merge and control both accounts. Verification sends the request for administrator review; it does not move your data or approvals. Ignore this email if you did not request it.",url))throw new AccountError("Could not send verification. Please try again.",503);
  return accountJson(generic);
}catch(error){return accountFailure(error);}}
