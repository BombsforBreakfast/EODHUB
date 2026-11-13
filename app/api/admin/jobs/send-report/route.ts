import type { NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { checkReportDb, reportContext, reportJson } from "@/app/lib/server/jobReport";
import { drainReportDeliveries } from "@/app/lib/server/jobReportDelivery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await authenticateAdminApiRequest(request);
  if (!auth.ok) return reportJson({ error: auth.error }, auth.status);
  if (process.env.JOB_REPORT_ENABLED !== "true") return reportJson({ error: "Job Report is disabled." }, 503);
  try {
    const ctx = reportContext();
    const prepared = await ctx.db.rpc("job_report_prepare_manual", { p_cutoff: new Date().toISOString(), p_live: ctx.live });
    checkReportDb(prepared.error);
    return reportJson({ reportId: prepared.data, ...await drainReportDeliveries(ctx) });
  } catch {
    return reportJson({ error: "Could not complete the send. Any queued deliveries will retry automatically; it is safe to try again." }, 503);
  }
}
