import Mux from "@mux/mux-node";

let client: Mux | null = null;

export function getMuxClient(): Mux {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) {
    throw new Error("Mux is not configured.");
  }
  client ??= new Mux({ tokenId, tokenSecret });
  return client;
}

export function muxWebhookSecret(): string {
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!secret) throw new Error("MUX_WEBHOOK_SECRET is not configured.");
  return secret;
}
