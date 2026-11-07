/**
 * Minimal S3-compatible client for Liara Object Storage.
 *
 * Liara's S3 endpoint uses path-style bucket addressing, so requests are sent
 * to the configured endpoint as /<bucket>/<object>. Credentials are read only
 * on the server.
 */

import { createHash, createHmac } from "node:crypto";

const SERVICE = "s3";
const REGION = "";
const ALGORITHM = "AWS4-HMAC-SHA256";

type LiaraConfig = {
  endpoint: URL;
  bucket: string;
  accessKey: string;
  secretKey: string;
};

function readConfig(): LiaraConfig | null {
  const endpointRaw = process.env.LIARA_ENDPOINT?.trim();
  const bucket = process.env.LIARA_BUCKET_NAME?.trim();
  const accessKey = process.env.LIARA_ACCESS_KEY?.trim();
  const secretKey = process.env.LIARA_SECRET_KEY?.trim();

  if (!endpointRaw || !bucket || !accessKey || !secretKey) return null;

  try {
    const endpointInput = /^https?:\/\//i.test(endpointRaw)
      ? endpointRaw
      : "https://" + endpointRaw;
    const endpoint = new URL(endpointInput);
    if (endpoint.protocol !== "https:") {
      throw new Error("LIARA_ENDPOINT must use HTTPS.");
    }
    return { endpoint, bucket, accessKey, secretKey };
  } catch (error) {
    console.warn(
      "[liara-storage] invalid configuration:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function liaraStorageConfigured(): boolean {
  return readConfig() !== null;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

function encodeKey(key: string): string {
  return key
    .split("/")
    .filter(Boolean)
    .map((segment) => rfc3986(segment))
    .join("/");
}

function objectUrl(config: LiaraConfig, key: string): URL {
  const url = new URL(config.endpoint.toString());
  const prefix = url.pathname.replace(/\/+$/, "");
  url.pathname =
    prefix +
    "/" +
    encodeURIComponent(config.bucket) +
    "/" +
    encodeKey(key);
  url.search = "";
  url.hash = "";
  return url;
}

function hmacSigningKey(secret: string, dateStamp: string): Buffer {
  const dateKey = hmac("AWS4" + secret, dateStamp);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function signedRequest(input: {
  method: "GET" | "PUT" | "DELETE";
  url: URL;
  accessKey: string;
  secretKey: string;
  body?: Buffer;
  contentType?: string;
}): RequestInit {
  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payload = input.body ?? Buffer.alloc(0);
  const payloadHash = sha256(payload);
  const host = input.url.host;
  const canonicalUri = input.url.pathname || "/";
  const contentType = input.contentType?.trim() || "";

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;

  const sortedHeaders = Object.keys(headers)
    .sort()
    .map((key) => [key, headers[key]] as const);
  const canonicalHeaders = sortedHeaders
    .map(
      ([key, value]) =>
        key + ":" + value.trim().replace(/\s+/g, " ") + "\n",
    )
    .join("");
  const signedHeaders = sortedHeaders.map(([key]) => key).join(";");
  const canonicalRequest = [
    input.method,
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope =
    dateStamp + "/" + REGION + "/" + SERVICE + "/aws4_request";
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    hmacSigningKey(input.secretKey, dateStamp),
    stringToSign,
  ).toString("hex");

  headers.authorization =
    ALGORITHM +
    " Credential=" +
    input.accessKey +
    "/" +
    credentialScope +
    ", SignedHeaders=" +
    signedHeaders +
    ", Signature=" +
    signature;

  let requestBody: ArrayBuffer | undefined;
  if (input.method === "PUT") {
    requestBody = new ArrayBuffer(payload.byteLength);
    new Uint8Array(requestBody).set(payload);
  }

  return {
    method: input.method,
    headers,
    ...(requestBody ? { body: requestBody } : {}),
  };
}

async function send(input: {
  method: "PUT" | "DELETE";
  key: string;
  body?: Buffer;
  contentType?: string;
}): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;

  const url = objectUrl(config, input.key);
  const request = signedRequest({
    ...input,
    url,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });

  try {
    const response = await fetch(url, request);
    if (response.ok) return true;

    const detail = (await response.text().catch(() => "")).trim().slice(0, 400);
    console.warn(
      "[liara-storage] " + input.method + " failed:",
      response.status,
      detail || response.statusText,
    );
    return false;
  } catch (error) {
    console.warn(
      "[liara-storage] " + input.method + " request failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function putLiaraObject(input: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<string | null> {
  const config = readConfig();
  if (!config) return null;

  const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body);
  const ok = await send({
    method: "PUT",
    key: input.key,
    body,
    contentType: input.contentType || "application/octet-stream",
  });
  return ok ? objectUrl(config, input.key).toString() : null;
}

/**
 * Fetches a private Liara object with a server-side Signature V4 request.
 * The optional Range header is forwarded after signing so browsers can seek
 * inside an audio file without exposing storage credentials.
 */
export async function getLiaraObject(input: {
  key: string;
  range?: string;
  timeoutMs?: number;
}): Promise<Response | null> {
  const config = readConfig();
  if (!config) return null;

  const url = objectUrl(config, input.key);
  const request = signedRequest({
    method: "GET",
    url,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });

  if (input.range) {
    (request.headers as Record<string, string>).range = input.range;
  }
  request.signal = AbortSignal.timeout(input.timeoutMs ?? 30_000);

  try {
    return await fetch(url, request);
  } catch (error) {
    console.warn(
      "[liara-storage] GET request failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function deleteLiaraObject(key: string): Promise<void> {
  await send({ method: "DELETE", key });
}

export function liaraObjectKeyFromUrl(
  value: string | null | undefined,
): string | null {
  const config = readConfig();
  if (!config || !value) return null;

  try {
    const target = new URL(value);
    const endpoint = new URL(config.endpoint.toString());
    const isLiaraHost = (host: string) =>
      ["liara.space", "liara.site", "liara.ir"].some(
        (domain) => host === domain || host.endsWith("." + domain),
      );
    // Existing property rows may retain Liara's previous public hostname
    // (.site) while the configured S3 endpoint uses .space. Accept only official
    // HTTPS Liara hosts and the configured bucket path; fetch from the configured
    // endpoint with server-side credentials, never from the legacy hostname.
    if (
      target.protocol !== "https:" ||
      endpoint.protocol !== "https:" ||
      !isLiaraHost(target.hostname.toLowerCase()) ||
      !isLiaraHost(endpoint.hostname.toLowerCase())
    ) return null;

    const prefix = endpoint.pathname.replace(/\/+$/, "");
    const expectedPrefix = prefix + "/" + encodeURIComponent(config.bucket) + "/";
    const legacyBucketPrefix = "/" + encodeURIComponent(config.bucket) + "/";
    const acceptedPrefix = target.pathname.startsWith(expectedPrefix)
      ? expectedPrefix
      : target.pathname.startsWith(legacyBucketPrefix)
        ? legacyBucketPrefix
        : "";
    if (!acceptedPrefix) return null;

    const raw = target.pathname.slice(acceptedPrefix.length);
    if (!raw) return null;
    const segments = raw.split("/").map((segment) => decodeURIComponent(segment));
    // A percent-encoded separator must not turn one URL path segment into
    // multiple S3 key segments. In particular, `..%2fother-bucket/...` would
    // otherwise escape the configured bucket when objectUrl() normalizes the
    // resulting dot segment in the request pathname.
    if (
      segments.some(
        (segment) =>
          segment === "." || segment === ".." || /[\\/]/.test(segment),
      )
    ) {
      return null;
    }
    return segments.join("/");
  } catch {
    return null;
  }
}

/** Restrict the public image proxy to object prefixes intentionally used by the site. */
export function isAllowedLiaraMediaKey(value: string): boolean {
  const key = value.trim();
  if (
    !key ||
    key.includes("\\") ||
    key.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return false;
  }

  return [
    "properties/uploads/",
    "properties/divar/",
    "properties/customer-submissions/",
    "areas/uploads/",
  ].some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}
