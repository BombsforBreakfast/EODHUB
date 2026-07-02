import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Resend } from "resend";
import {
  buildMonthlyCommunityUpdateEmailHtml,
  MONTHLY_COMMUNITY_UPDATE_SUBJECT,
} from "../app/lib/email/monthlyCommunityUpdateEmail";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

async function main() {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "EOD HUB <noreply@resend.dev>",
    to: "micheal.p.twigg@gmail.com",
    subject: MONTHLY_COMMUNITY_UPDATE_SUBJECT,
    html: buildMonthlyCommunityUpdateEmailHtml("https://eod-hub.com"),
  });

  if (error) {
    console.error("Failed:", error.message);
    process.exit(1);
  }

  console.log("Sent audit copy to micheal.p.twigg@gmail.com", data?.id ?? "");
}

void main();
