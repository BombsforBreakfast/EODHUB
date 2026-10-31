import type { NextRequest } from "next/server";
import { rentalAdministrator, rentalFailure, rentalJson } from "@/app/lib/rentals/portal.server";
import { rentalAnalyticsReport } from "@/app/lib/rentals/analytics.server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db } = await rentalAdministrator(request);
    return rentalJson(await rentalAnalyticsReport(db, request.nextUrl.searchParams));
  } catch (error) { return rentalFailure(error); }
}
