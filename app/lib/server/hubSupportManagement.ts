import "server-only";
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {z} from "zod";
const claimsSchema=z.object({v:z.literal(1),id:z.uuid(),email:z.string().regex(/^[a-f0-9]{64}$/),live:z.boolean(),exp:z.number().int(),nonce:z.string().regex(/^[a-f0-9]{32}$/)}).strict();
function secret(){const value=process.env.HUB_SUPPORT_MANAGE_SECRET;if(!value||value.length<32)throw Error("Support management is not configured");return value;}
export function supportEmailHash(email:string){return createHmac("sha256",secret()).update(`support-email-v1:${email.trim().toLowerCase()}`).digest("hex");}
export function signSupportManagement(id:string,emailHash:string,live:boolean,now=Date.now()){
  const data=Buffer.from(JSON.stringify({v:1,id,email:emailHash,live,exp:Math.floor(now/1000)+3600,nonce:randomBytes(16).toString("hex")})).toString("base64url");
  return `${data}.${createHmac("sha256",secret()).update(`support-manage-v1:${data}`).digest("base64url")}`;
}
export function verifySupportManagement(token:string,live:boolean,now=Date.now()){
  try{
    if(token.length>1200)return null;const parts=token.split(".");if(parts.length!==2||!/^[a-zA-Z0-9_-]+$/.test(parts[0])||!/^[a-zA-Z0-9_-]+$/.test(parts[1]))return null;
    const expected=createHmac("sha256",secret()).update(`support-manage-v1:${parts[0]}`).digest(),actual=Buffer.from(parts[1],"base64url");
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
    const claims=claimsSchema.parse(JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"))),time=Math.floor(now/1000);
    return claims.live===live&&claims.exp>time&&claims.exp<=time+3660?claims:null;
  }catch{return null;}
}
