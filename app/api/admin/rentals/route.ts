import { NextResponse, type NextRequest } from "next/server";
import { authenticateAdminApiRequest } from "@/app/lib/server/adminApiAuth";
import { isOwnerAdmin } from "@/app/lib/ownerAdminAccess";
import { rentalListings } from "@/app/lib/rentals/listings.server";
import { loadRentalListings } from "@/app/lib/rentals/availability.server";
import { parseRentalAvailability } from "@/app/lib/rentals/availability";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize(request: NextRequest) {
  const access = await authenticateAdminApiRequest(request);
  if (!access.ok) return { response: json({ error: access.error }, access.status) };
  if (!isOwnerAdmin({ userId: access.user.id, email: access.user.email, isAdmin: true })) return { response: json({ error: "Only the Hub owner can manage rentals." }, 403) };
  return access;
}
export async function GET(request: NextRequest) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  try {
    const listings = await loadRentalListings(access.admin);
    return json({ items: listings.map(item => ({ id: item.id, address: item.address, status: item.availability.status, projectedAvailabilityDate: item.projectedAvailabilityDate ?? "" })) });
  } catch { return json({ error: "Could not load rental availability. Please retry." }, 503); }
}
export async function PATCH(request: NextRequest) {
  const access = await authorize(request);
  if ("response" in access) return access.response;
  let input: ReturnType<typeof parseRentalAvailability>;
  try {
    const text = await request.text();
    if (text.length > 2000) throw new Error("Request is too large.");
    input = parseRentalAvailability(JSON.parse(text));
    if (!rentalListings.some(item => item.id === input.id)) return json({ error: "Unknown property." }, 404);
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Check the status and projected date." }, 400); }
  const { error } = await access.admin.from("rental_listing_status").upsert({ listing_id: input.id, status: input.status, projected_availability_date: input.projectedAvailabilityDate, updated_at: new Date().toISOString(), updated_by: access.user.id }, { onConflict: "listing_id" });
  if (error) return json({ error: "Could not save availability. Your changes have not been saved." }, 503);
  return json({ ok: true });
}
