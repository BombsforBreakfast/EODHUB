import crypto from "crypto";
import {
  ANDROID_NOTIFICATION_CHANNEL_ID,
  ANDROID_PUSH_NOTIFICATION_SOUND,
} from "../pushNotificationSound";

type FcmPayload = {
  title: string;
  body: string;
  link?: string | null;
  badgeCount?: number;
};

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function readServiceAccount(): FirebaseServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as FirebaseServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    const privateKey = parsed.private_key.includes("\\n")
      ? parsed.private_key.replace(/\\n/g, "\n")
      : parsed.private_key;
    return { ...parsed, private_key: privateKey };
  } catch {
    return null;
  }
}

async function getFcmAccessToken(account: FirebaseServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: account.private_key,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  });
  const assertion = `${signingInput}.${signature.toString("base64url")}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !body.access_token) return null;

  cachedAccessToken = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600),
  };
  return body.access_token;
}

export function isFcmConfigured(): boolean {
  return readServiceAccount() !== null;
}

export async function sendFcmPush(
  deviceToken: string,
  payload: FcmPayload,
): Promise<{ ok: true } | { ok: false; reason: string; status?: number }> {
  const account = readServiceAccount();
  if (!account) {
    return { ok: false, reason: "fcm_not_configured" };
  }

  const accessToken = await getFcmAccessToken(account);
  if (!accessToken) {
    return { ok: false, reason: "fcm_auth_failed" };
  }

  const message = {
    token: deviceToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      link: payload.link ?? "/",
    },
    android: {
      priority: "HIGH",
      notification: {
        channel_id: ANDROID_NOTIFICATION_CHANNEL_ID,
        sound: ANDROID_PUSH_NOTIFICATION_SOUND,
        ...(typeof payload.badgeCount === "number"
          ? { notification_count: Math.max(0, Math.floor(payload.badgeCount)) }
          : {}),
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: unknown[] };
  };

  if (res.ok) {
    return { ok: true };
  }

  const reason =
    body.error?.message ||
    body.error?.status ||
    `fcm_http_${res.status}`;

  return { ok: false, reason, status: res.status };
}

export function isInvalidFcmToken(result: { ok: false; reason: string; status?: number }): boolean {
  if (result.status === 404) return true;
  return /UNREGISTERED|NOT_FOUND|InvalidRegistration|registration-token-not-registered/i.test(
    result.reason,
  );
}
