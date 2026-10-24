import { type NextRequest } from "next/server";
import { supportDb, supportGuard, supportJson } from "@/app/lib/server/hubSupport";

export async function GET(request: NextRequest) {
  const denied = supportGuard(request);
  if (denied) return denied;
  try {
    // Calendar month in the Hub's home timezone. Expose totals only, never donor data.
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit" });
    const parts = formatter.formatToParts(new Date());
    const month = `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
    let raisedCents = 0;
    const db = supportDb();
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from("hub_contributions")
        .select("amount_cents,refunded_cents,paid_at")
        .eq("livemode", true).not("paid_at", "is", null)
        .gte("paid_at", `${month}-01T00:00:00Z`)
        .order("id").range(offset, offset + 499);
      if (error) throw error;
      for (const row of data ?? []) {
        const paid = formatter.formatToParts(new Date(row.paid_at));
        const paidMonth = `${paid.find(p => p.type === "year")!.value}-${paid.find(p => p.type === "month")!.value}`;
        if (paidMonth === month) raisedCents += Math.max(0, row.amount_cents - row.refunded_cents);
      }
      if (!data || data.length < 500) break;
    }
    return supportJson({ raisedCents, goalCents: 17325 });
  } catch {
    return supportJson({ error: "Support totals are temporarily unavailable." }, 503);
  }
}
