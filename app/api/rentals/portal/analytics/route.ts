import type { NextRequest } from "next/server";
import { rentalProvider, rentalFailure, rentalJson } from "@/app/lib/rentals/portal.server";
import { rentalAnalyticsReport } from "@/app/lib/rentals/analytics.server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const { db, provider } = await rentalProvider(request);
    return rentalJson(await rentalAnalyticsReport(db, request.nextUrl.searchParams, provider.user_id));
  } catch (error) { return rentalFailure(error); }
}
