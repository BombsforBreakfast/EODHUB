import { notFound } from "next/navigation";
import { sharedAuthEnabled,requireSharedSchema } from "@/app/lib/account/server";
import { parsePortal,safeAccountReturn } from "@/app/lib/account/access";
import AccountSignIn from "./AccountSignIn";
import { ticketingOrigin } from "@/app/lib/ticketing/access";
export const dynamic="force-dynamic";
export const metadata={title:"Sign in | EOD-HUB",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function SignInPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  if(!sharedAuthEnabled())notFound();const params=await searchParams,portal=parsePortal(params.portal);
  let serviceReady=false,oauthReady=false;try{const settings=await requireSharedSchema();serviceReady=true;oauthReady=settings.enabled;}catch{/* Keep the preview read-only until the staged migration exists. */}
  return <AccountSignIn portal={portal} serviceReady={serviceReady} oauthReady={oauthReady} next={safeAccountReturn(params.next,portal==="events"&&ticketingOrigin()?"/ticketing/workspace":`/account?portal=${portal}`)} />;
}
