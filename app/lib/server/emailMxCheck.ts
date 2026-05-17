import { promises as dns } from "dns";

const MX_TIMEOUT_MS = 2500;

export async function domainHasMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("mx_timeout")), MX_TIMEOUT_MS);
      }),
    ]);
    return Array.isArray(records) && records.length > 0;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    if (err instanceof Error && err.message === "mx_timeout") return false;
    return false;
  }
}
