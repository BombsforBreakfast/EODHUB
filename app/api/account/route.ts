import type { NextRequest } from "next/server";
import { accountActor,accountBody,accountFailure,accountJson,accountSnapshot,accountWrite,AccountError,checkAccountDb,sharedAuthEnabled,requireSharedSchema } from "@/app/lib/account/server";
import { signupSchema,RENTAL_COMMITMENT_VERSION } from "@/app/lib/rentals/provider";
import { accountAdminEmail } from "@/app/lib/account/mail.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
  if(!sharedAuthEnabled())throw new AccountError("Shared account settings are not enabled yet.",404);
  const actor=await accountActor(request);await requireSharedSchema(actor.db);const snapshot=await accountSnapshot(actor);
  const details=await actor.db.rpc("portal_auth_details",{p_actor:actor.user.id});checkAccountDb(details.error);
  return accountJson({...snapshot,hasPassword:details.data?.hasPassword===true});
}catch(error){return accountFailure(error);}}
export async function POST(request:NextRequest){try{
  if(!sharedAuthEnabled())throw new AccountError("Shared account settings are not enabled yet.",404);
  accountWrite(request);const actor=await accountActor(request),body=await accountBody(request),{db,user}=actor;
  await requireSharedSchema(db);
  if(!actor.emailVerified)throw new AccountError("Verify your sign-in email before requesting access.",403);
  if(body.action==="request-hub"){
    checkAccountDb((await db.rpc("portal_request_hub",{p_actor:user.id})).error);
    return accountJson({ok:true,destination:"/onboarding"});
  }
  if(body.action==="request-rentals"){
    const input=signupSchema.parse({...body,email:user.email});
    const result=await db.from("rental_providers").upsert({user_id:user.id,email:user.email!.toLowerCase(),full_name:input.fullName,phone:input.phone,company:input.company,commitment_version:RENTAL_COMMITMENT_VERSION,email_verified_at:user.email_confirmed_at},{onConflict:"user_id",ignoreDuplicates:true}).select("user_id");
    checkAccountDb(result.error);
    if(result.data?.length)await accountAdminEmail("Provider ready for review","A signed-in EOD-HUB account requested Rentals provider access. Review in Admin → Rentals. Existing Hub permissions are unchanged.");
    return accountJson({ok:true,destination:"/promote/rentals/portal"});
  }
  if(body.action==="request-events"){
    checkAccountDb((await db.from("ticketing_accounts").upsert({user_id:user.id},{onConflict:"user_id",ignoreDuplicates:true})).error);
    checkAccountDb((await db.from("portal_access_requests").upsert({user_id:user.id,portal:"event_organizer"},{onConflict:"user_id,portal",ignoreDuplicates:true})).error);
    return accountJson({ok:true});
  }
  if(body.action==="buyer-access"){
    // Ignore conflicts: sign-in must never reactivate a suspended event account.
    checkAccountDb((await db.from("ticketing_accounts").upsert({user_id:user.id},{onConflict:"user_id",ignoreDuplicates:true})).error);
    return accountJson({ok:true,destination:"/ticketing/workspace"});
  }
  throw new AccountError("Unknown account action.");
}catch(error){return accountFailure(error);}}
