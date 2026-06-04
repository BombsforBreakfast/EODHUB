import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_PREFIX = "plain:";

function getEncryptionKey(): Buffer | null {
  const raw = process.env.COMMERCE_SECRETS_KEY?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

/**
 * TODO: Move token storage to Supabase Vault or a dedicated KMS before multi-tenant production.
 * When COMMERCE_SECRETS_KEY is unset, values are stored with a dev-only prefix for local POC.
 */
export function encryptCommerceSecret(plainText: string): string {
  const key = getEncryptionKey();
  if (!key) return `${DEV_PREFIX}${plainText}`;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptCommerceSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith(DEV_PREFIX)) return stored.slice(DEV_PREFIX.length);

  const key = getEncryptionKey();
  if (!key) return null;

  const [version, ivB64, tagB64, dataB64] = stored.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
