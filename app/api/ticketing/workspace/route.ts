import { NextRequest } from "next/server";
import { ticketingActor, ticketingBody, ticketingCommand, ticketingFailure, ticketingJson, ticketingRequest, ticketingWorkspace } from "@/app/lib/ticketing/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return ticketingJson(await ticketingWorkspace(await ticketingActor(request))); }
  catch (error) { return ticketingFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    ticketingRequest(request, true);
    const actor = await ticketingActor(request), body = await ticketingBody(request);
    return ticketingJson(await ticketingCommand(actor, body));
  } catch (error) { return ticketingFailure(error); }
}
