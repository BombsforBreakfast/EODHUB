import "server-only";
import { Resend } from "resend";
import { OWNER_ADMIN_EMAIL } from "../ownerAdminAccess";
const escape=(text:string)=>text.replace(/[&<>"']/g,value=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[value]!);
export async function accountEmail(to:string,subject:string,message:string,url:string){
  if(!process.env.RESEND_API_KEY || process.env.SHARED_ACCOUNT_EMAIL_ENABLED==="0")return false;
  const result=await new Resend(process.env.RESEND_API_KEY).emails.send({
    from:process.env.RESEND_FROM_EMAIL??"EOD-HUB <noreply@resend.dev>",to,subject:`EOD-HUB: ${subject}`,
    text:`${message}\n\n${url}\n\nQuestions? hello@eod-hub.com`,
    html:`<div style="font-family:Arial,sans-serif;max-width:580px;margin:32px auto"><p style="font-weight:bold">EOD-HUB</p><h1 style="font-size:24px">${escape(subject)}</h1><p style="line-height:1.6;white-space:pre-line">${escape(message)}</p><a href="${escape(url)}" style="display:inline-block;padding:12px 18px;background:#5546ba;color:white;border-radius:8px">Continue to EOD-HUB</a><p style="font-size:12px">Questions? hello@eod-hub.com</p></div>`,
  });
  if(result.error)console.error("[account email] delivery failed",result.error.name);
  return !result.error;
}
export const accountAdminEmail=(subject:string,message:string)=>accountEmail(OWNER_ADMIN_EMAIL,subject,message,"https://eod-hub.com/admin");
