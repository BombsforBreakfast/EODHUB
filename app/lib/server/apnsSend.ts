import crypto from "crypto";
import http2 from "http2";

type ApnsPayload = {
  title: string;
  body: string;
  link?: string | null;
};

type ApnsConfig = {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  environment: "production" | "sandbox";
};

let cachedJwt: { token: string; expiresAt: number } | null = null;

function readApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "com.eodhub.app";
  const privateKeyRaw = process.env.APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !privateKeyRaw) return null;

  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;

  const envRaw = process.env.APNS_ENV?.trim().toLowerCase();
  const environment = envRaw === "sandbox" ? "sandbox" : "production";

  return { keyId, teamId, bundleId, privateKey, environment };
}

function createApnsJwt(config: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwt.expiresAt > now + 60) {
    return cachedJwt.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: config.keyId })).toString(
    "base64url",
  );
  const payload = Buffer.from(JSON.stringify({ iss: config.teamId, iat: now })).toString(
    "base64url",
  );
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: config.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${signingInput}.${signature.toString("base64url")}`;
  cachedJwt = { token, expiresAt: now + 3000 };
  return token;
}

function apnsHost(environment: "production" | "sandbox"): string {
  return environment === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
}

export function isApnsConfigured(): boolean {
  return readApnsConfig() !== null;
}

export async function sendApnsPush(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<{ ok: true } | { ok: false; reason: string; status?: number }> {
  const config = readApnsConfig();
  if (!config) {
    return { ok: false, reason: "apns_not_configured" };
  }

  const jwt = createApnsJwt(config);
  const host = apnsHost(config.environment);
  const path = `/3/device/${deviceToken}`;

  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: "default",
  };

  const body = JSON.stringify({
    aps,
    link: payload.link ?? "/",
  });

  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; reason: string; status?: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.close();
      resolve(result);
    };
    const timeout = setTimeout(() => {
      client.destroy();
      finish({ ok: false, reason: "apns_request_timeout" });
    }, 10_000);

    client.on("error", (err) => {
      finish({ ok: false, reason: err.message });
    });

    const req = client.request({
      ":method": "POST",
      ":path": path,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    req.setEncoding("utf8");
    let responseBody = "";
    req.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 0);
      req.on("data", (chunk) => {
        responseBody += chunk;
      });
      req.on("end", () => {
        if (status >= 200 && status < 300) {
          finish({ ok: true });
          return;
        }
        finish({
          ok: false,
          reason: responseBody || `apns_http_${status}`,
          status,
        });
      });
    });

    req.on("error", (err) => {
      finish({ ok: false, reason: err.message });
    });

    req.write(body);
    req.end();
  });
}
