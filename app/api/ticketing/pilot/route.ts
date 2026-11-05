import { NextRequest } from "next/server";
import { issuePilotOrder, pilotCatalog, pilotOrderPage, setNoCardPilot } from "@/app/lib/ticketing/pilot-checkout-server";
import { noCardPilotAllowed } from "@/app/lib/ticketing/pilot-checkout";
import { ticketingActor, ticketingBody, ticketingFailure, ticketingJson, ticketingRequest, TicketingError } from "@/app/lib/ticketing/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    if (!noCardPilotAllowed()) throw new TicketingError("Not found", 404);
    const actor = await ticketingActor(request);
    const [events, page] = await Promise.all([pilotCatalog(actor), pilotOrderPage(actor, request.nextUrl.searchParams.get("before"))]);
    return ticketingJson({ events, ...page });
  } catch (error) { return ticketingFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    if (!noCardPilotAllowed()) throw new TicketingError("Not found", 404);
    ticketingRequest(request, true);
    const actor = await ticketingActor(request), body = await ticketingBody(request);
    if (body.action === "set-mode") return ticketingJson(await setNoCardPilot(actor, body));
    if (body.action === "claim") return ticketingJson(await issuePilotOrder(actor, body));
    throw new TicketingError("Choose a ticketing action.");
  } catch (error) { return ticketingFailure(error); }
}
