import { NextRequest } from "next/server";
import { TICKETING_COOKIE } from "@/app/lib/ticketing/access";
import { checkTicketingDb, hashTicketingSecret, requestTicketingSignIn, ticketingActor, ticketingBody, ticketingDatabase, ticketingFailure, ticketingJson, ticketingLimit, ticketingRequest, verifyTicketingSignIn } from "@/app/lib/ticketing/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await ticketingActor(request);
    return ticketingJson({ user: { id: actor.user.id, email: actor.user.email }, admin: actor.admin });
  } catch (error) { return ticketingFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const origin = ticketingRequest(request, true), body = await ticketingBody(request, 4000), db = ticketingDatabase();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (body.action === "request-link") return ticketingJson(await requestTicketingSignIn(db, body.email, origin, ip));
    if (body.action === "verify") {
      await ticketingLimit(db, "verify-ip", ip, 30, 600);
      const token = await verifyTicketingSignIn(db, body.token, origin);
      const response = ticketingJson({ ok: true });
      response.cookies.set(TICKETING_COOKIE, token, { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/ticketing", maxAge: 86400 });
      return response;
    }
    if (body.action === "signout") {
      const token = request.cookies.get(TICKETING_COOKIE)?.value;
      if (token) checkTicketingDb((await db.from("ticketing_sessions").update({ revoked_at: new Date().toISOString() }).eq("digest", hashTicketingSecret(token))).error);
      const response = ticketingJson({ ok: true });
      response.cookies.set(TICKETING_COOKIE, "", { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: "/api/ticketing", maxAge: 0 });
      return response;
    }
    return ticketingJson({ error: "Unknown sign-in action." }, 400);
  } catch (error) { return ticketingFailure(error); }
}
