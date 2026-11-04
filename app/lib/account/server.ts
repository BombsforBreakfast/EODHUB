import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { primaryEmailProof,type VerifiedSessionClaims } from "./email-proof";
import { accountAccess,isPortalOnlyIdentity } from "./access";
import { isOwnerAdmin } from "../ownerAdminAccess";
import { ZodError } from "zod";
import { ticketingOrigin } from "../ticketing/access";

export class AccountError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function sharedAuthEnabled() { return process.env.SHARED_PORTAL_AUTH_ENABLED === "1" || process.env.NEXT_PUBLIC_SHARED_PORTAL_AUTH_ENABLED === "1"; }
export function accountDatabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new AccountError("Account services are temporarily unavailable.", 503);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:init?.signal??AbortSignal.timeout(20000)})}});
}
export function accountJson(value: unknown, status=200) { return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}}); }
export function accountFailure(error: unknown) {
  if (error instanceof AccountError) return accountJson({error:error.message},error.status);
  if (error instanceof ZodError) return accountJson({error:error.issues[0]?.message??"Check the required fields."},400);
  console.error("[account] request failed", error instanceof Error ? error.name : "unknown");
  return accountJson({error:"Could not complete that account action. Please retry."},503);
}
export function checkAccountDb(error: {message:string} | null) { if(error) throw new AccountError("Could not save or load your account. Please retry.",503); }
export async function requireSharedSchema(db=accountDatabase()) {
  const result=await db.from("portal_auth_settings").select("enabled").eq("id",true).maybeSingle();
  if(result.error || !result.data)throw new AccountError("Shared sign-in is being prepared. Existing Hub sign-in remains available.",503);
  return result.data;
}
export async function accountActor(request: NextRequest) {
  const db=accountDatabase();
  let user: User | null=null;
  let token=request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if(!token){
    const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>request.cookies.getAll(),setAll:()=>{}}});
    token=(await client.auth.getSession()).data.session?.access_token;
  }
  // Authenticate the exact token before reading claims; getSession alone is not verification.
  if(token)user=(await db.auth.getUser(token)).data.user;
  if(!user)throw new AccountError("Sign in to your EOD-HUB account.",401);
  const current=await db.auth.admin.getUserById(user.id);
  const banned=(current.data.user as User & {banned_until?:string}|null)?.banned_until;
  if(current.error||!current.data.user||(banned&&Date.parse(banned)>Date.now()))throw new AccountError("This account is unavailable.",403);
  user=current.data.user;
  let claims:VerifiedSessionClaims={};
  try{claims=JSON.parse(Buffer.from(token!.split(".")[1],"base64url").toString("utf8"));}catch{throw new AccountError("Sign in again.",401);}
  if(claims.sub!==user.id)throw new AccountError("Sign in again.",401);
  if(sharedAuthEnabled()||isPortalOnlyIdentity(user)){
    if(!/^[0-9a-f-]{36}$/i.test(claims.session_id??""))throw new AccountError("Sign in again.",401);
    const session=await db.rpc("portal_session_active",{p_actor:user.id,p_session:claims.session_id});checkAccountDb(session.error);
    if(!session.data)throw new AccountError("Your session ended. Sign in again.",401);
  }
  const profile=await db.from("profiles").select("email,email_verified,is_pure_admin,account_type").eq("user_id",user.id).maybeSingle();checkAccountDb(profile.error);
  const proof=primaryEmailProof(user,profile.data,claims);
  if(proof.record){
    const saved=await db.auth.admin.updateUserById(user.id,{app_metadata:{...user.app_metadata,shared_verified_email:user.email!.toLowerCase(),shared_verified_email_at:new Date().toISOString()}});
    if(saved.error)throw new AccountError("Could not confirm your email. Please retry.",503);
    user=saved.data.user;
  }
  return {db,user,emailVerified:proof.verified};
}
export function accountWrite(request:NextRequest) {
  if(request.headers.get("origin")!==new URL(request.url).origin) throw new AccountError("Use this site's account form.",403);
}
export async function accountBody(request:Request,maximum=16000):Promise<Record<string,unknown>> {
  if(!request.headers.get("content-type")?.startsWith("application/json")) throw new AccountError("Use the account form.",415);
  const reader=request.body?.getReader();if(!reader)throw new AccountError("Missing account request.");
  const chunks:Uint8Array[]=[];let bytes=0;
  while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.byteLength;if(bytes>maximum){await reader.cancel();throw new AccountError("Request is too large.",413);}chunks.push(result.value);}
  const raw=Buffer.concat(chunks).toString("utf8");
  try { const body=JSON.parse(raw);if(!body || typeof body!=="object" || Array.isArray(body))throw new Error();return body; } catch {throw new AccountError("Invalid account request.");}
}
export async function accountSnapshot({db,user,emailVerified}:Awaited<ReturnType<typeof accountActor>>) {
  const [p,r,e,a,q]=await Promise.all([
    db.from("profiles").select("*").eq("user_id",user.id).maybeSingle(),
    db.from("rental_providers").select("status,full_name,phone,company,review_note").eq("user_id",user.id).maybeSingle(),
    db.from("ticketing_accounts").select("active,can_submit_events").eq("user_id",user.id).maybeSingle(),
    db.from("ticketing_assignments").select("event_id,role,expires_at,revoked_at").eq("user_id",user.id),
    db.from("portal_access_requests").select("portal,status,review_note").eq("user_id",user.id),
  ]);[p,r,e,a,q].forEach(result=>checkAccountDb(result.error));
  return {user:{id:user.id,email:user.email,emailVerified,providers:(user.identities??[]).map(row=>row.provider)},profile:p.data,rental:r.data,eventAccount:e.data,eventsAvailable:!!ticketingOrigin(),requests:q.data??[],access:accountAccess({profile:p.data,rental:r.data,events:e.data,assignments:a.data??[],organizerSuspended:q.data?.some(row=>row.portal==="event_organizer"&&row.status==="suspended")}),admin:isOwnerAdmin({userId:user.id,email:user.email,isAdmin:p.data?.is_admin})};
}
