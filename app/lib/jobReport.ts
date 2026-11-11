export const JOB_REPORT_PURPOSE = "eodhub_job_report";
export const JOB_REPORT_PATH = "/promote/job-report";
export const JOB_REPORT_PRICE_CENTS = 199;
export type ReportJob = { id: string; title: string; company?: string; location?: string; payMin?: number; payMax?: number; description?: string; applyUrl: string; source?: string; approvedAt?: string };
export type ReportSubscriber = {
  id: string; email: string; livemode: boolean; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  subscription_created: number; status: string; paid_until: string | null; unsubscribed_at: string | null;
  suppressed_at: string | null; risk_hold: boolean; cancel_at_period_end: boolean; initial_prepared: boolean;
  checkout_key: string; checkout_session_id: string | null;
};
export function reportEligible(s: Pick<ReportSubscriber,"status"|"paid_until"|"unsubscribed_at"|"suppressed_at"|"risk_hold">, now=Date.now()) {
  return ["active","past_due"].includes(s.status) && Date.parse(s.paid_until??"")>now && !s.unsubscribed_at && !s.suppressed_at && !s.risk_hold;
}
export function reportApplicationUrl(value: string) {
  try { const u=new URL(value); return ["https:","http:"].includes(u.protocol) && !u.username && !u.password ? u.toString() : null; } catch { return null; }
}
export const reportExcerpt = (value="") => value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,220);
export const reportEscape = (s: string) => s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]!);
export function reportSalary(job: ReportJob) {
  const numbers=[job.payMin,job.payMax].filter((n):n is number=>typeof n==="number" && Number.isFinite(n) && n>0);
  return numbers.length ? [...new Set(numbers)].map(n=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(n)).join(" – ") : null;
}
export function reportEmail(jobs: ReportJob[], date: string, manageUrl: string, unsubscribeUrl: string) {
  const e=reportEscape;
  const cards=jobs.map(job=>{
    const url=reportApplicationUrl(job.applyUrl); if(!url)return "";
    const salary=reportSalary(job);
    return `<article style="margin:16px 0;padding:20px;border:1px solid #d8e2dc;border-radius:12px"><h2 style="font-size:19px;margin:0 0 8px">${e(job.title)}</h2><p>${e([job.company,job.location].filter(Boolean).join(" · "))}</p>${salary?`<p>Salary: ${e(salary)}</p>`:""}<p style="line-height:1.5">${e(reportExcerpt(job.description))}</p><a href="${e(url)}" style="display:inline-block;background:#153d29;color:#fff;padding:11px 18px;border-radius:7px;text-decoration:none">View listing &amp; apply</a>${job.source==="adzuna"?'<p><a href="https://www.adzuna.com" style="display:inline-block;min-width:116px;min-height:23px;font-size:24px">Adzuna</a></p>':""}</article>`;
  }).join("");
  return {
    subject:`The Job Report · ${date} · ${jobs.length} new opportunit${jobs.length===1?"y":"ies"}`,
    html:`<div style="background:#f5f8f6;padding:24px 12px;font-family:Arial,sans-serif;color:#18241d"><main style="max-width:620px;margin:auto"><p style="letter-spacing:2px;font-weight:bold;color:#153d29">EOD-HUB</p><h1 style="font-size:30px">The Job Report</h1><p>Newly approved EOD opportunities · ${e(date)}</p>${cards}<footer style="font-size:12px;line-height:1.6;color:#53645b"><p>You subscribed to The Job Report. Expect 4–6 reports most weeks, depending on job availability and review activity. No filler emails.</p><p><a href="${e(manageUrl)}">Manage or cancel subscription</a> · <a href="${e(unsubscribeUrl)}">Unsubscribe &amp; cancel future renewals</a></p><p>EOD-HUB LLC<br>Contact: hello@eod-hub.com</p></footer></main></div>`,
    text:`The Job Report by EOD-HUB\n${date}\n\n${jobs.map(j=>`${j.title}\n${[j.company,j.location].filter(Boolean).join(" · ")}${reportSalary(j)?`\nSalary: ${reportSalary(j)}`:""}\n${reportExcerpt(j.description)}\n${j.applyUrl}${j.source==="adzuna"?"\nSource: Adzuna — https://www.adzuna.com":""}`).join("\n\n")}\n\nManage or cancel: ${manageUrl}\nUnsubscribe and cancel future renewals: ${unsubscribeUrl}\nEOD-HUB LLC\nContact: hello@eod-hub.com`,
  };
}
/** Latest 7 p.m. Eastern cutoff, including DST. Repeated sweeps catch delayed runs. */
export function reportCutoff(now=new Date()) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)!.value;
  const date=new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`);
  if(Number(value("hour"))<19)date.setUTCDate(date.getUTCDate()-1);
  const day=date.toISOString().slice(0,10);
  const noon=new Date(`${day}T19:00:00Z`);
  const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",hourCycle:"h23"}).format(noon));
  return new Date(noon.getTime()+(19-hour)*3600000);
}
