import type { PropertyRow } from "./provider";

export const BILLING_GRACE_MS = 7 * 86400000;
export const billingDeadline = (started: number) => new Date(started + BILLING_GRACE_MS).toISOString();
export const billingDate = (value: string) => new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " Eastern";
export const billingMoney = (amount: number, currency = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
export type BillingCase = {
  id: string; incident_key: string; property_id: string; provider_id: string;
  subscription_id: string; kind: "payment_failed" | "payment_stopped" | "term_ended" | "refund" | "dispute" | "fraud_warning";
  status: "open" | "resolved" | "expired"; opened_at: string; deadline: string;
  stripe_object_id: string; detail: string; note: string | null; resolved_at: string | null;
};
export function rentalNeedsNewTerm(row: Pick<PropertyRow, "stripe_subscription_id" | "payment_status" | "paid_until">, now = Date.now()) {
  return !row.stripe_subscription_id || (["canceled", "incomplete_expired", "unpaid"].includes(row.payment_status) && (!row.paid_until || Date.parse(row.paid_until) <= now));
}
export function annualReminderWindow(end: string, now = Date.now()): 30 | 7 | null {
  const days = (Date.parse(end) - now) / 86400000;
  return days > 7 && days <= 30 ? 30 : days > 0 && days <= 7 ? 7 : null;
}
