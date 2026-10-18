// Voluntary, one-time support. This feature never grants account entitlements.
export const HUB_SUPPORT_PURPOSE = "eod_hub_voluntary_support";
export const HUB_SUPPORT_MIN_CENTS = 100;
export const HUB_SUPPORT_MAX_CENTS = 50000;
export const HUB_SUPPORT_PRESETS = [100, 300, 500] as const;
export const HUB_SUPPORT_DISCLOSURE = "This is a voluntary contribution to EOD-HUB LLC, a business. It is not a tax-deductible charitable donation. No goods, services, or additional access are provided.";
export const HUB_SUPPORT_COSTS = [
  ["Database management", "$30 / month"],
  ["Domain and web hosting", "$25 / month"],
  ["Google Workspace", "$10 / month"],
  ["Meta", "$40 / month"],
  ["AI tools", "$40 / month"],
  ["Email tools", "$20 / month"],
  ["Apple Developer membership", "$99 / year"],
  ["Google Play registration", "$25 one-time"],
] as const;

export function isSupportAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= HUB_SUPPORT_MIN_CENTS && value <= HUB_SUPPORT_MAX_CENTS;
}

export function supportDollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function parseSupportAmount(value: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars, decimals = ""] = value.trim().split(".");
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, "0"));
  return isSupportAmount(cents) ? cents : null;
}
