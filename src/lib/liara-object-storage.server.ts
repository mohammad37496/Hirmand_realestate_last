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

export type LiaraObjectHead = {
  sizeBytes: number;
  contentType: string;
  etag: string | null;
};

export type LiaraObjectInventory = {
  objectCount: number;
  totalBytes: number;
  complete: boolean;
  pagesScanned: number;
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

/** Direct browser uploads remain opt-in until the bucket's CORS policy is set. */
export function liaraDirectUploadEnabled(): boolean {
  return process.env.LIARA_DIRECT_UPLOAD_ENABLED?.trim().toLowerCase() === "true" &&
    liaraStorageConfigured();
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

function canonicalQuery(url: URL): string {
  return Array.from(url.searchParams.entries())
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0) ||
      (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
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

export function liaraObjectUrl(key: string): string | null {
  const config = readConfig();
  return config ? objectUrl(config, key).toString() : null;
}

function hmacSigningKey(secret: string, dateStamp: string): Buffer {
  const dateKey = hmac("AWS4" + secret, dateStamp);
  const regionKey = hmac(dateKey, REGION);
  const serviceKey = hmac(regionKey, SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function signedRequest(input: {
  method: "GET" | "HEAD" | "PUT" | "DELETE";
  url: URL;
  accessKey: string;
  secretKey: string;
  body?: Buffer;
  contentType?: string;
  extraHeaders?: Record<string, string>;
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
  for (const [name, value] of Object.entries(input.extraHeaders ?? {})) {
    headers[name.toLowerCase()] = value.trim().replace(/\s+/g, " ");
  }

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
    canonicalQuery(input.url),
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
  extraHeaders?: Record<string, string>;
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
    if (response.ok || (input.method === "DELETE" && response.status === 404)) return true;

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

/** Copy a verified staging object to its immutable publication key server-side. */
export async function copyLiaraObject(sourceKey: string, destinationKey: string): Promise<boolean> {
  const config = readConfig();
  if (!config) return false;
  const url = objectUrl(config, destinationKey);
  const source = "/" + encodeURIComponent(config.bucket) + "/" + encodeKey(sourceKey);
  const request = signedRequest({
    method: "PUT",
    url,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    body: Buffer.alloc(0),
    extraHeaders: { "x-amz-copy-source": source },
  });
  try {
    const response = await fetchWithHeaderTimeout(fetch, url, request, 15_000);
    if (!response.ok) return false;
    const body = await response.text().catch(() => "");
    return !/<Error\b/i.test(body);
  } catch (error) {
    console.warn("[liara-storage] COPY request failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Create a short-lived path-style S3 Signature V4 URL for a single browser PUT.
 * Content-Type is part of SignedHeaders, so the browser must send this exact
 * value. The payload uses UNSIGNED-PAYLOAD because the browser streams the file
 * directly and the completion endpoint verifies the stored bytes afterwards.
 */
export function createLiaraPresignedPutUrl(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
  expiresInSeconds?: number;
  now?: Date;
}): { url: string; headers: Record<string, string> } | null {
  const config = readConfig();
  if (!config) return null;

  const expiresInSeconds = Math.floor(input.expiresInSeconds ?? 900);
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 900) {
    throw new Error("Liara direct-upload URL expiry must be between 60 and 900 seconds.");
  }
  const contentType = input.contentType.trim().toLowerCase();
  if (!contentType || /[\r\n]/.test(contentType)) {
    throw new Error("A valid Content-Type is required for a direct upload.");
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("A positive, safe upload size is required for a direct upload.");
  }

  const url = objectUrl(config, input.key);
  const now = input.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = dateStamp + "/" + REGION + "/" + SERVICE + "/aws4_request";
  const signedHeaders = "content-length;content-type;host";
  url.searchParams.set("X-Amz-Algorithm", ALGORITHM);
  url.searchParams.set("X-Amz-Credential", config.accessKey + "/" + credentialScope);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalHeaders =
    "content-length:" + input.sizeBytes + "\n" +
    "content-type:" + contentType + "\n" +
    "host:" + url.host + "\n";
  const canonicalRequest = [
    "PUT",
    url.pathname || "/",
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");
  const signature = hmac(
    hmacSigningKey(config.secretKey, dateStamp),
    stringToSign,
  ).toString("hex");
  url.searchParams.set("X-Amz-Signature", signature);

  return {
    url: url.toString(),
    headers: { "content-type": contentType },
  };
}

/** Read server-verified metadata for a single object without downloading it. */
export async function headLiaraObject(key: string): Promise<LiaraObjectHead | null> {
  const config = readConfig();
  if (!config) return null;
  const url = objectUrl(config, key);
  try {
    const response = await fetchWithHeaderTimeout(
      fetch,
      url,
      signedRequest({
        method: "HEAD",
        url,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
      }),
      10_000,
    );
    if (!response.ok) return null;
    const sizeBytes = Number(response.headers.get("content-length"));
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return null;
    return {
      sizeBytes,
      contentType: (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase(),
      etag: response.headers.get("etag"),
    };
  } catch (error) {
    console.warn("[liara-storage] HEAD request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return '"';
    if (normalized === "apos") return "'";
    const numeric = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity;
  });
}

async function readBoundedLiaraResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Liara response exceeded the inventory response-size limit.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("Liara response exceeded the inventory response-size limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

/**
 * Bounded ListObjectsV2 scan for admin telemetry. A partial scan is explicitly
 * marked incomplete; callers must never present its totals as bucket totals.
 */
export async function listLiaraObjectInventory(maxPages = 10): Promise<LiaraObjectInventory> {
  const config = readConfig();
  if (!config) throw new Error("Liara Object Storage is not configured.");
  const pageLimit = Math.max(1, Math.min(100, Math.floor(maxPages)));
  let continuationToken: string | null = null;
  let objectCount = 0;
  let totalBytes = 0;
  let pagesScanned = 0;
  let complete = false;

  while (pagesScanned < pageLimit) {
    const url = objectUrl(config, "");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("max-keys", "1000");
    if (continuationToken) url.searchParams.set("continuation-token", continuationToken);
    const response = await fetch(
      url,
      {
        ...signedRequest({
          method: "GET",
          url,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        }),
        // Abort covers both response headers and XML body consumption.
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Liara inventory request failed (HTTP ${response.status}).`);
    }
    const xml = await readBoundedLiaraResponseText(response, 4 * 1024 * 1024);
    const truncatedValue = xml.match(/<IsTruncated>\s*(true|false)\s*<\/IsTruncated>/i)?.[1]?.toLowerCase();
    if (!/<ListBucketResult(?:\s|>)/i.test(xml) || !truncatedValue) {
      throw new Error("Liara returned an invalid ListObjectsV2 response.");
    }
    for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)) {
      const block = match[1] ?? "";
      const sizeMatch = block.match(/<Size>(\d+)<\/Size>/i);
      if (!sizeMatch) throw new Error("Liara returned an object without a valid Size value.");
      const size = Number(sizeMatch[1]);
      if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(totalBytes + size)) {
        throw new Error("Liara returned an unsafe object size; inventory totals are unavailable.");
      }
      objectCount += 1;
      totalBytes += size;
    }
    pagesScanned += 1;
    const truncated = truncatedValue === "true";
    if (!truncated) {
      complete = true;
      break;
    }
    const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/i)?.[1];
    continuationToken = next ? decodeXmlText(next.trim()) : null;
    if (!continuationToken) break;
  }

  return { objectCount, totalBytes, complete, pagesScanned };
}

/**
 * Fetches a private Liara object with a server-side Signature V4 request.
 * The optional Range header is forwarded after signing so browsers can seek
 * inside audio/video files without exposing storage credentials. timeoutMs
 * bounds only the wait for response headers; callers own body-stream limits.
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

  try {
    // Bound connection/header latency, not the streamed response body. Callers
    // may be proxying long audio/video objects and must be able to consume them
    // after the initial response headers arrive.
    return await fetchWithHeaderTimeout(fetch, url, request, input.timeoutMs ?? 30_000);
  } catch (error) {
    console.warn(
      "[liara-storage] GET request failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function fetchWithHeaderTimeout(
  fetcher: typeof fetch,
  url: URL,
  request: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await fetcher(url, { ...request, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteLiaraObject(key: string): Promise<boolean> {
  return send({ method: "DELETE", key });
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
