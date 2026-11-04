import type { SupabaseClient } from "@supabase/supabase-js";
export const sharedAuthEnabledClient = () => process.env.NEXT_PUBLIC_SHARED_PORTAL_AUTH_ENABLED === "1";
export async function accountFetch(client:SupabaseClient,path="/api/account",body?:unknown) {
  const {data}=await client.auth.getSession();
  if(!data.session)throw new Error("Sign in to your EOD-HUB account.");
  const response=await fetch(path,{method:body?"POST":"GET",cache:"no-store",headers:{Authorization:`Bearer ${data.session.access_token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not load your account.");return result;
}
