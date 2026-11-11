import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { reportContext, reportJson } from "@/app/lib/server/jobReport";
import { sweepReport } from "@/app/lib/server/jobReportDelivery";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:NextRequest) {
  const actual=Buffer.from(request.headers.get("authorization")??"");const secret=process.env.CRON_SECRET;
  const expected=Buffer.from(`Bearer ${secret??""}`);
  if(!secret||actual.length!==expected.length||!timingSafeEqual(actual,expected))return reportJson({error:"Unauthorized"},401);
  if(process.env.JOB_REPORT_ENABLED!=="true")return reportJson({skipped:true});
  try {return reportJson(await sweepReport(reportContext()));}catch {return reportJson({error:"Job Report work remains queued for retry"},503);}
}
