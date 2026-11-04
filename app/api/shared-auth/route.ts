import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { accountBody,accountDatabase,accountFailure,accountJson,accountWrite,AccountError,checkAccountDb,sharedAuthEnabled,requireSharedSchema } from "@/app/lib/account/server";
import { parsePortal,PORTAL_ROLE,safeAccountReturn } from "@/app/lib/account/access";
import { findAuthUsersByEmail } from "@/app/lib/auth/adminAuthLookup";
import { validateEmailForRegistration } from "@/app/lib/email-validation";
import { accountEmail } from "@/app/lib/account/mail.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest) {
  try {
    if(!sharedAuthEnabled())throw new AccountError("Shared sign-in is not enabled yet.",404);
    accountWrite(request);
    const body=await accountBody(request,5000),db=accountDatabase();
    await requireSharedSchema(db);
    if(body.action!=="request-link" && body.action!=="signup")throw new AccountError("Unknown sign-in action.");
    const checked=validateEmailForRegistration(typeof body.email==="string"?body.email:"");
    if(!checked.ok)throw new AccountError("Enter a valid, permanent email address.");
    const email=checked.email;
    const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"local";
    for(const [key,limit] of [[`ip:${ip}`,15],[`email:${email}`,5]] as const){
      const result=await db.rpc("rental_consume_limit",{p_key:`shared-auth:${createHash("sha256").update(key).digest("hex")}`,p_limit:limit,p_seconds:3600});
      checkAccountDb(result.error);if(!result.data)throw new AccountError("Too many attempts. Please try again later.",429);
    }
    const generic={ok:true,message:"Check your inbox for a secure sign-in link. If you already have an account, use its existing sign-in method or this email link."};
    const password=typeof body.password==="string"?body.password:"";
    if(body.action==="signup" && (password.length<8 || password.length>128))throw new AccountError("Choose a password between 8 and 128 characters.");
    let found=await findAuthUsersByEmail(db,email);
    if(found.listError || found.users.length>1)throw new AccountError("This account needs administrator review. Contact hello@eod-hub.com.",409);
    let user=found.users[0];
    if(!user){
      const created=await db.auth.admin.createUser({email,...(body.action==="signup"?{password}:{}),role:PORTAL_ROLE,email_confirm:false,app_metadata:{account_type:"shared_account"}});
      if(created.error || !created.data.user){
        found=await findAuthUsersByEmail(db,email);if(found.listError || found.users.length!==1)throw new AccountError("Could not prepare your sign-in. Please retry.",503);
        user=found.users[0];
      } else user=created.data.user;
    }
    // Existing passwords, approvals and suspended grants are never changed by signup.
    const banned=(user as typeof user & {banned_until?:string}).banned_until;
    if(banned && Date.parse(banned)>Date.now())return accountJson(generic);
    const link=await db.auth.admin.generateLink({type:"magiclink",email});
    if(link.error || !link.data.properties?.hashed_token || link.data.user.id!==user.id)throw new AccountError("Could not prepare a sign-in link.",503);
    const portal=parsePortal(body.portal),next=safeAccountReturn(body.next,`/account?portal=${portal}`);
    const url=`${new URL(request.url).origin}/account/sign-in?portal=${portal}&next=${encodeURIComponent(next)}#token_hash=${encodeURIComponent(link.data.properties.hashed_token)}`;
    if(!await accountEmail(email,"Your sign-in link","Sign in to your EOD-HUB account. This one-use link does not grant Hub membership, property-provider access or event-organizer access. Those approvals remain separate. Ignore this email if you did not request it.",url))throw new AccountError("The sign-in email could not be sent. Please try again.",503);
    return accountJson(generic);
  }catch(error){return accountFailure(error);}
}
