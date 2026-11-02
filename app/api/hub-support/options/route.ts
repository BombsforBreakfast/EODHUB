import { type NextRequest } from "next/server";
import { monthlySupportReady } from "@/app/lib/hubSupportMonthly";
import { supportGuard, supportJson } from "@/app/lib/server/hubSupport";
export function GET(request: NextRequest) {
  return supportGuard(request) ?? supportJson({ monthlyEnabled: monthlySupportReady() });
}
