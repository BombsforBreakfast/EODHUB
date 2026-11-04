/** Claims may be read here only AFTER getUser has verified this exact JWT.
 * A password login to a legacy auto-confirmed account is not email ownership.
 * https://supabase.com/docs/guides/auth/jwt-fields */
export type VerifiedSessionClaims={sub?:string;email?:string;session_id?:string;amr?:{method?:string;timestamp?:number}[]};
type Identity={email?:string;email_confirmed_at?:string;app_metadata?:Record<string,unknown>;identities?:{provider?:string;identity_data?:Record<string,unknown>}[]|null};
type Profile={email?:string|null;email_verified?:boolean|null;is_pure_admin?:boolean|null;account_type?:string|null}|null;
const normalized=(value:unknown)=>typeof value==="string"?value.trim().toLowerCase():"";
export function primaryEmailProof(user:Identity,profile:Profile,claims:VerifiedSessionClaims){
  const email=normalized(user.email),confirmed=!!user.email_confirmed_at;
  if(!email)return {verified:false,record:false};
  if(confirmed && profile && (!profile.email || normalized(profile.email)===email) && (profile.email_verified || profile.is_pure_admin || profile.account_type==="business_org"))return {verified:true,record:false};
  if(confirmed && normalized(user.app_metadata?.shared_verified_email)===email)return {verified:true,record:false};
  if(confirmed && user.identities?.some(identity=>["google","apple"].includes(identity.provider??"")&&normalized(identity.identity_data?.email)===email))return {verified:true,record:false};
  const confirmedAt=Date.parse(user.email_confirmed_at??"");
  const linkedEmail=normalized(claims.email)===email;
  const proof=confirmed && linkedEmail && Array.isArray(claims.amr) && claims.amr.some(row=>["otp","magiclink","recovery"].includes(row.method??"")&&typeof row.timestamp==="number"&&Number.isFinite(row.timestamp)&&row.timestamp*1000+1000>=confirmedAt);
  return {verified:proof,record:proof};
}
