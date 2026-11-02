import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ticketingOrigin } from "@/app/lib/ticketing/access";
import TicketingWorkspace from "../TicketingWorkspace";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events & tickets | EOD-HUB pilot", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function TicketingPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const origin = ticketingOrigin(), requestHeaders = await headers();
  if (!origin || requestHeaders.get("host") !== new URL(origin).host || /Capacitor/i.test(requestHeaders.get("user-agent") ?? "")) notFound();
  const { path = [] } = await params;
  if (path.length > 1 || (path.length === 1 && !["access", "workspace", "admin", "scan", "manage"].includes(path[0]))) notFound();
  return <TicketingWorkspace />;
}
