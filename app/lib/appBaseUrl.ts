/** Canonical site origin for server-built links (invite URLs, emails). */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim();
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "").trim();
  if (vercel && !vercel.startsWith("http")) return `https://${vercel}`;
  if (vercel) return vercel;
  return "https://eod-hub.com";
}
