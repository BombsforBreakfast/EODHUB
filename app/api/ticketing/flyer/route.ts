import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { activeAssignment, uuidPattern } from "@/app/lib/ticketing/access";
import { checkTicketingDb, TicketingError, ticketingActor, ticketingDatabase, ticketingFailure, ticketingHeaders, ticketingJson, ticketingLimit, ticketingRequest } from "@/app/lib/ticketing/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const bucket = "ticketing-pilot-media";

export async function POST(request: NextRequest) {
  try {
    ticketingRequest(request, true);
    const actor = await ticketingActor(request);
    if (!actor.admin && !actor.account.can_submit_events && !actor.assignments.some(row => row.role === "coordinator" && activeAssignment(row))) throw new TicketingError("Only event coordinators can upload flyers.", 403);
    await ticketingLimit(actor.db, "flyers", actor.user.id, 25, 86400);
    const reader = request.body?.getReader(); if (!reader) throw new TicketingError("Choose an image.");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const value = await reader.read(); if (value.done) break;
      size += value.value.length;
      if (size > 6 * 1024 * 1024 + 20000) { await reader.cancel(); throw new TicketingError("Choose an image under 6 MB.", 413); }
      chunks.push(value.value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 6 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new TicketingError("Choose a JPG, PNG or WebP image under 6 MB.");
    let bytes: Buffer;
    try {
      const input = Buffer.from(await file.arrayBuffer()), image = sharp(input, { limitInputPixels: 25000000, animated: false });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error();
      bytes = await image.rotate().resize({ width: 1800, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new TicketingError("This image could not be read. Choose a static JPG, PNG or WebP."); }
    const id = randomUUID(), path = `${actor.user.id}/${id}.webp`;
    const uploaded = await actor.db.storage.from(bucket).upload(path, bytes, { contentType: "image/webp", upsert: false }); checkTicketingDb(uploaded.error);
    const saved = await actor.db.from("ticketing_flyers").insert({ id, uploader_id: actor.user.id, path });
    if (saved.error) { await actor.db.storage.from(bucket).remove([path]); checkTicketingDb(saved.error); }
    return ticketingJson({ flyerUrl: `/api/ticketing/flyer?id=${id}` });
  } catch (error) { return ticketingFailure(error); }
}
export async function GET(request: NextRequest) {
  try {
    ticketingRequest(request);
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!uuidPattern.test(id)) throw new TicketingError("Image not found.", 404);
    const db = ticketingDatabase(), flyer = await db.from("ticketing_flyers").select("uploader_id,path").eq("id", id).maybeSingle(); checkTicketingDb(flyer.error);
    if (!flyer.data) throw new TicketingError("Image not found.", 404);
    const actor = await ticketingActor(request);
    let allowed = actor.admin || flyer.data.uploader_id === actor.user.id;
    if (!allowed) {
      const ids = actor.assignments.filter(row => row.role === "coordinator" && activeAssignment(row)).map(row => row.event_id);
      if (ids.length) {
        const events = await db.from("ticketing_events").select("id").in("id", ids).contains("draft", { flyerUrl: `/api/ticketing/flyer?id=${id}` }).limit(1); checkTicketingDb(events.error);
        allowed = !!events.data?.length;
      }
    }
    if (!allowed) throw new TicketingError("Image not found.", 404);
    const downloaded = await db.storage.from(bucket).download(flyer.data.path); checkTicketingDb(downloaded.error);
    if (!downloaded.data) throw new TicketingError("Image not found.", 404);
    return new NextResponse(downloaded.data, { headers: { ...ticketingHeaders, "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return ticketingFailure(error); }
}
