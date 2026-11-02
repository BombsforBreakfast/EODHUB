import "server-only";
import {Resend} from "resend";
import type {SupabaseClient} from "@supabase/supabase-js";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export type SupportMail={recipient:string;subject:string;message:string;link:string;livemode:boolean};
export function supportTestRecipientAllowed(to:string,live:boolean){return live||(process.env.HUB_SUPPORT_TEST_EMAIL_ALLOWLIST??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean).includes(to.trim().toLowerCase());}
export async function sendSupportEmail(mail:SupportMail,key:string){
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL||!supportTestRecipientAllowed(mail.recipient,mail.livemode))return false;
  const {error}=await new Resend(process.env.RESEND_API_KEY).emails.send({from:process.env.RESEND_FROM_EMAIL,to:mail.recipient,
    subject:`EOD-HUB Support: ${mail.subject}`,
    text:`${mail.message}\n\n${mail.link}\n\nQuestions? hello@eod-hub.com`,
    html:`<div style="font-family:Arial,sans-serif;max-width:580px;margin:32px auto;color:#18241d"><p style="font-weight:bold">EOD-HUB / COMMUNITY SUPPORT</p><h1 style="font-size:24px">${escape(mail.subject)}</h1><p style="line-height:1.7;white-space:pre-line">${escape(mail.message)}</p><a href="${escape(mail.link)}" style="display:inline-block;padding:14px 20px;background:#15803d;color:white;border-radius:8px">Open EOD-HUB Support</a><p style="font-size:12px">Questions? hello@eod-hub.com</p></div>`
  },{idempotencyKey:key});
  if(error)console.error("[hub-support email] delivery deferred",error.name);return !error;
}
export async function queueSupportEmail(db:SupabaseClient,key:string,mail:SupportMail){const r=await db.from("hub_support_billing_emails").upsert({message_key:key,...mail},{onConflict:"message_key",ignoreDuplicates:true});if(r.error)throw Error("Could not queue support email");}
export async function drainSupportEmails(db:SupabaseClient,live:boolean,send=sendSupportEmail){
  const {data,error}=await db.rpc("hub_support_claim_emails",{p_live:live});if(error)throw Error("Could not claim support emails");let sent=0;
  for(const row of data??[]){try{if(await send(row,`hub-support-mail-${row.id}`)){const saved=await db.from("hub_support_billing_emails").update({sent_at:new Date().toISOString()}).eq("id",row.id);if(saved.error)throw Error("Could not record email delivery");sent++;}}catch{console.error("[hub-support email] queued for retry",row.id);}}
  return {attempted:data?.length??0,sent};
}
