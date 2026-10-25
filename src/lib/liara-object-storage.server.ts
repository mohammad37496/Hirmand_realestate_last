/**
 * Minimal S3-compatible client for Liara Object Storage.
 *
 * Liara's S3 endpoint uses path-style bucket addressing, so requests are sent
 * to the configured endpoint as /<bucket>/<object>. Credentials are read only
 * on the server.
 */

import { createHash, createHmac } from "node:crypto";
import { open, stat } from "node:fs/promises";

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
  method: "GET" | "PUT" | "POST" | "DELETE";
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
  const canonicalQuery = Array.from(input.url.searchParams.entries())
    .map(([key, value]) => [rfc3986(key), rfc3986(value)] as const)
    .sort(([keyA, valueA], [keyB, valueB]) => keyA.localeCompare(keyB) || valueA.localeCompare(valueB))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
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
  if (input.body !== undefined) {
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
  const deleted = await send({ method: "DELETE", key });
  if (!deleted) throw new Error("Liara Object Storage delete request did not complete successfully");
}

export function liaraObjectKeyFromUrl(
  value: string | null | undefined,
): string | null {
  const config = readConfig();
  if (!config || !value) return null;

  try {
    const target = new URL(value);
    const endpoint = new URL(config.endpoint.toString());
    if (target.origin !== endpoint.origin) return null;

    const prefix = endpoint.pathname.replace(/\/+$/, "");
    const expectedPrefix =
      prefix + "/" + encodeURIComponent(config.bucket) + "/";
    if (!target.pathname.startsWith(expectedPrefix)) return null;

    const raw = target.pathname.slice(expectedPrefix.length);
    if (!raw) return null;
    return raw
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}

/** Property/media keys that may be served publicly through the same-origin proxy. */
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
    // Divar imports use their own stable prefix and must also be served through
    // the same-origin proxy because the Liara bucket is private.
    "properties/divar/",
    "properties/customer-submissions/",
    "areas/uploads/",
  ].some((prefix) => key.startsWith(prefix) && key.length > prefix.length);
}

/** Convert a private Liara object URL to a browser-safe same-origin URL. */
export function liaraMediaProxyUrl(value: string, contentType = ""): string {
  const key = liaraObjectKeyFromUrl(value);
  if (!key || !isAllowedLiaraMediaKey(key)) return value;

  const params = new URLSearchParams({ url: value });
  if (contentType.toLowerCase().startsWith("video/")) params.set("type", "video");
  return "/api/liara-media?" + params.toString();
}

/** Recover the private object key when a stored property uses the proxy URL. */
export function liaraObjectKeyFromBrowserProxy(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, "https://hirmand.invalid");
    if (parsed.origin !== "https://hirmand.invalid" || parsed.pathname !== "/api/liara-media") {
      return null;
    }
    const raw = parsed.searchParams.get("url");
    const key = liaraObjectKeyFromUrl(raw);
    return key && isAllowedLiaraMediaKey(key) ? key : null;
  } catch {
    return null;
  }
}


async function multipartRequest(input: {
  config: LiaraConfig;
  method: "POST" | "PUT" | "DELETE";
  url: URL;
  body?: Buffer;
  contentType?: string;
}): Promise<Response> {
  const request = signedRequest({
    method: input.method,
    url: input.url,
    accessKey: input.config.accessKey,
    secretKey: input.config.secretKey,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.contentType ? { contentType: input.contentType } : {}),
  });
  return fetch(input.url, request);
}

function decodeXmlValue(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Upload a disk-backed object with S3 multipart upload. Memory is bounded by a
 * single 8 MiB part instead of the full file, so large property videos do not
 * require multi-gigabyte Buffer allocations inside the 1 GiB Liara app.
 */
export async function putLiaraObjectFromFile(input: {
  key: string;
  filePath: string;
  contentType: string;
}): Promise<string | null> {
  const config = readConfig();
  if (!config) return null;

  const fileInfo = await stat(input.filePath);
  if (!fileInfo.isFile() || fileInfo.size <= 0) {
    throw new Error("فایل موقت برای ذخیره‌سازی پیدا نشد یا خالی است.");
  }

  const partSize = 8 * 1024 * 1024; // S3 multipart minimum is 5 MiB except the last part.
  const totalParts = Math.ceil(fileInfo.size / partSize);
  if (totalParts > 10_000) throw new Error("تعداد بخش‌های فایل از محدودیت ذخیره‌سازی بیشتر است.");

  let uploadId: string | null = null;
  const partEtags: Array<{ partNumber: number; etag: string }> = [];
  const file = await open(input.filePath, "r");
  try {
    const initiateUrl = objectUrl(config, input.key);
    initiateUrl.searchParams.set("uploads", "");
    const initiated = await multipartRequest({
      config,
      method: "POST",
      url: initiateUrl,
    });
    const initiateBody = await initiated.text().catch(() => "");
    if (!initiated.ok) {
      throw new Error(`شروع آپلود چندبخشی Liara ناموفق بود (HTTP ${initiated.status}): ${initiateBody.slice(0, 300)}`);
    }
    const idMatch = initiateBody.match(/<UploadId>([\s\S]*?)<\/UploadId>/i);
    uploadId = idMatch ? decodeXmlValue(idMatch[1]!.trim()) : null;
    if (!uploadId) throw new Error("Liara شناسه آپلود چندبخشی برنگرداند.");

    for (let partNumber = 1, position = 0; position < fileInfo.size; partNumber += 1) {
      const expectedLength = Math.min(partSize, fileInfo.size - position);
      const partBuffer = Buffer.allocUnsafe(expectedLength);
      let readLength = 0;
      while (readLength < expectedLength) {
        const result = await file.read(
          partBuffer,
          readLength,
          expectedLength - readLength,
          position + readLength,
        );
        if (result.bytesRead === 0) throw new Error("خواندن بخش فایل موقت پیش از پایان فایل متوقف شد.");
        readLength += result.bytesRead;
      }

      const partUrl = objectUrl(config, input.key);
      partUrl.searchParams.set("partNumber", String(partNumber));
      partUrl.searchParams.set("uploadId", uploadId);
      const uploaded = await multipartRequest({
        config,
        method: "PUT",
        url: partUrl,
        body: partBuffer,
        contentType: input.contentType || "application/octet-stream",
      });
      const responseBody = await uploaded.text().catch(() => "");
      if (!uploaded.ok) {
        throw new Error(`آپلود بخش ${partNumber} به Liara ناموفق بود (HTTP ${uploaded.status}): ${responseBody.slice(0, 300)}`);
      }
      const etag = uploaded.headers.get("etag")?.trim();
      if (!etag) throw new Error(`Liara برای بخش ${partNumber} شناسه ETag برنگرداند.`);
      partEtags.push({ partNumber, etag });
      position += expectedLength;
    }
  } catch (error) {
    if (uploadId) {
      const abortUrl = objectUrl(config, input.key);
      abortUrl.searchParams.set("uploadId", uploadId);
      await multipartRequest({ config, method: "DELETE", url: abortUrl }).catch(() => undefined);
    }
    console.warn(
      "[liara-storage] multipart file upload failed:",
      error instanceof Error ? error.message : error,
    );
    throw error;
  } finally {
    await file.close();
  }

  if (!uploadId || partEtags.length !== totalParts) {
    throw new Error("آپلود چندبخشی Liara کامل نشد.");
  }

  const completeXml =
    "<CompleteMultipartUpload>" +
    partEtags.map(({ partNumber, etag }) =>
      `<Part><PartNumber>${partNumber}</PartNumber><ETag>${etag.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</ETag></Part>`,
    ).join("") +
    "</CompleteMultipartUpload>";
  const completeUrl = objectUrl(config, input.key);
  completeUrl.searchParams.set("uploadId", uploadId);
  const completed = await multipartRequest({
    config,
    method: "POST",
    url: completeUrl,
    body: Buffer.from(completeXml, "utf8"),
    contentType: "application/xml",
  });
  const completeBody = await completed.text().catch(() => "");
  if (!completed.ok || /<Error(?:\\s|>)/i.test(completeBody)) {
    const abortUrl = objectUrl(config, input.key);
    abortUrl.searchParams.set("uploadId", uploadId);
    await multipartRequest({ config, method: "DELETE", url: abortUrl }).catch(() => undefined);
    throw new Error(`اتمام آپلود چندبخشی Liara ناموفق بود (HTTP ${completed.status}): ${completeBody.slice(0, 300)}`);
  }

  return objectUrl(config, input.key).toString();
}
