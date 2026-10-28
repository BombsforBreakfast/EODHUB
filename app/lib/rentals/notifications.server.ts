import "server-only";
import { Resend } from "resend";
import { OWNER_ADMIN_EMAIL } from "@/app/lib/ownerAdminAccess";
import { RENTAL_PORTAL } from "./provider";

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function rentalEmail(to: string, subject: string, message: string, link = `https://eod-hub.com${RENTAL_PORTAL}`) {
  if (!process.env.RESEND_API_KEY) return false;
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD-HUB <noreply@resend.dev>", to, subject: `EOD-HUB Rentals: ${subject}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:580px;margin:32px auto;color:#18241d"><p style="font-weight:bold;letter-spacing:2px">EOD-HUB / RENTALS</p><h1 style="font-size:24px">${escape(subject)}</h1><p style="line-height:1.7;white-space:pre-line">${escape(message)}</p><a href="${escape(link)}" style="display:inline-block;padding:14px 20px;background:#153d29;color:white;border-radius:8px">Open EOD-HUB Rentals</a><p style="font-size:12px;color:#647067">Questions? hello@eod-hub.com</p></div>`,
  });
  if (error) console.error("[rentals email] delivery failed", error.name);
  return !error;
}
export const rentalAdminEmail = (subject: string, message: string) => rentalEmail(OWNER_ADMIN_EMAIL, subject, message, "https://eod-hub.com/admin");
