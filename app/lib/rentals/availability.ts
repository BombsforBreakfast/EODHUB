export const RENTAL_STATUSES = ["available-now", "pending", "unavailable"] as const;
export type RentalStatus = typeof RENTAL_STATUSES[number];
export type RentalStatusRow = { listing_id: string; status: RentalStatus; projected_availability_date: string | null; updated_at: string };

export function parseRentalAvailability(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Invalid availability.");
  const value = input as Record<string, unknown>;
  if (typeof value.id !== "string" || !RENTAL_STATUSES.includes(value.status as RentalStatus)) throw new Error("Choose a valid property and status.");
  const date = value.projectedAvailabilityDate;
  if (date !== null && date !== "" && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("Enter a valid projected availability date or leave it blank.");
  return { id: value.id, status: value.status as RentalStatus, projectedAvailabilityDate: date === "" ? null : date as string | null };
}
