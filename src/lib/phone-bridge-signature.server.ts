import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createError, getHeader, type H3Event } from "h3";
import { getSql } from "@/lib/db";

export type { H3Event } from "h3";

type HashableBody = Buffer | Uint8Array | string;

export function sha256Hex(body: HashableBody): string {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  return createHash("sha256").update(buffer).digest("hex");
}

export type CanonicalSigningInput = {
  deviceId: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
};

export type CanonicalSigningRequest = {
  deviceId: string;
  timestamp: string;
  nonce: string;
  body: HashableBody;
};

export function canonicalSigningInput(input: CanonicalSigningRequest): string;
export function canonicalSigningInput(input: CanonicalSigningInput): string;
export function canonicalSigningInput(
  deviceId: string,
  timestamp: string,
  nonce: string,
  bodyHash: string,
): string;
export function canonicalSigningInput(
  inputOrDeviceId: CanonicalSigningRequest | CanonicalSigningInput | string,
  timestamp?: string,
  nonce?: string,
  bodyHash?: string,
) {
  const input =
    typeof inputOrDeviceId === "string"
      ? {
          deviceId: inputOrDeviceId,
          timestamp: timestamp ?? "",
          nonce: nonce ?? "",
          bodyHash: bodyHash ?? "",
        }
      : "body" in inputOrDeviceId
        ? {
            deviceId: inputOrDeviceId.deviceId,
            timestamp: inputOrDeviceId.timestamp,
            nonce: inputOrDeviceId.nonce,
            bodyHash: sha256Hex(inputOrDeviceId.body),
          }
        : inputOrDeviceId;
  return `v1.${input.deviceId}.${input.timestamp}.${input.nonce}.${input.bodyHash}`;
}

export function verifySignature(input: {
  secret: string;
  deviceId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  body: HashableBody;
}): boolean {
  const bodyHash = sha256Hex(input.body);
  const signingInput = canonicalSigningInput(
    input.deviceId,
    input.timestamp,
    input.nonce,
    bodyHash,
  );
  const expected = createHmac("sha256", input.secret)
    .update(signingInput, "utf8")
    .digest("hex");
  return sameSignature(expected, input.signature);
}

export function checkSignatureFreshness(
  headers: {
    timestamp?: string;
    nonce?: string;
    signature?: string;
    version?: string;
  },
  options?: { now?: number },
): { ok: boolean; reason?: string } {
  const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  const now = options?.now ?? Date.now();

  if (!headers.timestamp || !headers.nonce || !headers.signature) {
    return { ok: false, reason: "missing" };
  }

  if (!/^\d{13}$/.test(headers.timestamp)) {
    return { ok: false, reason: "malformed" };
  }

  const timestampMs = Number(headers.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, reason: "malformed" };
  }

  if (Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "stale" };
  }

  if (!/^[a-f0-9]{64}$/.test(headers.signature)) {
    return { ok: false, reason: "malformed" };
  }

  if (headers.version && headers.version !== "1") {
    return { ok: false, reason: "malformed" };
  }

  return { ok: true };
}

export function rememberNonce(
  deviceId: string,
  nonce: string,
  options?: { now?: number },
): boolean {
  // In-memory nonce store for tests.
  const globalRef = globalThis as typeof globalThis & {
    __phoneBridgeNonces__?: Map<string, number>;
  };
  if (!globalRef.__phoneBridgeNonces__) {
    globalRef.__phoneBridgeNonces__ = new Map();
  }
  const key = `${deviceId}:${nonce}`;
  const now = options?.now ?? Date.now();

  if (globalRef.__phoneBridgeNonces__.has(key)) {
    return false;
  }

  globalRef.__phoneBridgeNonces__.set(key, now);
  return true;
}

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const NONCE_TTL_MS = 10 * 60 * 1000;

function bearer(event: H3Event) {
  const auth = getHeader(event, "authorization") ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function expectedSignature(
  secret: string,
  deviceId: string,
  timestamp: string,
  nonce: string,
  bodyHash: string,
) {
  return createHmac("sha256", secret)
    .update(`v1.${deviceId}.${timestamp}.${nonce}.${bodyHash}`, "utf8")
    .digest("hex");
}

function sameSignature(left: string, right: string) {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateRequestNonce() {
  return randomBytes(24).toString("base64url");
}

export function signRequest(
  secret: string,
  deviceId: string,
  timestamp: string,
  nonce: string,
  body: HashableBody,
) {
  return expectedSignature(
    secret,
    deviceId,
    timestamp,
    nonce,
    sha256Hex(body),
  );
}

export async function requirePhoneBridgeSignedRequest(
  event: H3Event,
  deviceId: string,
  body: HashableBody,
) {
  const secret = bearer(event);
  const timestamp = getHeader(event, "x-hirmand-timestamp")?.trim() ?? "";
  const nonce = getHeader(event, "x-hirmand-nonce")?.trim() ?? "";
  const signature = getHeader(event, "x-hirmand-signature")?.trim().toLowerCase() ?? "";

  const timestampMs = Number(timestamp);
  if (!/^\d{13}$/.test(timestamp) || !Number.isFinite(timestampMs)) {
    throw createError({
      statusCode: 401,
      statusMessage: "امضای درخواست Phone Bridge ناقص است.",
    });
  }
  if (!nonce || nonce.length > 160 || !/^[A-Za-z0-9_-]+$/.test(nonce)) {
    throw createError({
      statusCode: 401,
      statusMessage: "شناسهٔ یکتای درخواست معتبر نیست.",
    });
  }
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    throw createError({
      statusCode: 401,
      statusMessage: "امضای درخواست معتبر نیست.",
    });
  }
  if (Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw createError({
      statusCode: 401,
      statusMessage: "زمان درخواست Phone Bridge منقضی یا نامعتبر است.",
    });
  }
  if (!secret) {
    throw createError({
      statusCode: 401,
      statusMessage: "توکن Phone Bridge ارسال نشده است.",
    });
  }

  const expected = expectedSignature(
    secret,
    deviceId,
    timestamp,
    nonce,
    sha256Hex(body),
  );
  if (!sameSignature(signature, expected)) {
    throw createError({
      statusCode: 401,
      statusMessage: "امضای درخواست Phone Bridge معتبر نیست.",
    });
  }

  const sql = await getSql();
  await sql.query(
    `delete from phone_bridge_request_nonces
     where expires_at < current_timestamp`,
  );

  const inserted = await sql.query<{ nonce: string }>(
    `insert into phone_bridge_request_nonces(device_id,nonce,expires_at)
     values ($1,$2,$3)
     on conflict (device_id,nonce) do nothing
     returning nonce`,
    [
      deviceId,
      nonce,
      new Date(Date.now() + NONCE_TTL_MS).toISOString(),
    ],
  );

  if (inserted.length === 0) {
    throw createError({
      statusCode: 409,
      statusMessage: "درخواست Phone Bridge دوباره ارسال شده است.",
    });
  }
}
