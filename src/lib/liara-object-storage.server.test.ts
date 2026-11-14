import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, test } from "node:test";
import {
  copyLiaraObject,
  createLiaraPresignedPutUrl,
  headLiaraObject,
  liaraDirectUploadEnabled,
  liaraObjectUrl,
  listLiaraObjectInventory,
} from "./liara-object-storage.server.ts";

const envKeys = [
  "LIARA_ENDPOINT",
  "LIARA_BUCKET_NAME",
  "LIARA_ACCESS_KEY",
  "LIARA_SECRET_KEY",
  "LIARA_DIRECT_UPLOAD_ENABLED",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

function configureLiara() {
  process.env.LIARA_ENDPOINT = "https://storage.c2.liara.space";
  process.env.LIARA_BUCKET_NAME = "hirmand-test";
  process.env.LIARA_ACCESS_KEY = "test-access";
  process.env.LIARA_SECRET_KEY = "test-secret";
  process.env.LIARA_DIRECT_UPLOAD_ENABLED = "true";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

test("Liara presigned PUT binds path, short expiry and exact Content-Type with Signature V4", () => {
  configureLiara();
  const now = new Date("2026-11-13T12:34:56.000Z");
  const signed = createLiaraPresignedPutUrl({
    key: "properties/uploads/front photo.jpg",
    contentType: "image/jpeg",
    sizeBytes: 12345,
    expiresInSeconds: 900,
    now,
  });
  assert.ok(signed);
  const url = new URL(signed.url);
  assert.equal(url.pathname, "/hirmand-test/properties/uploads/front%20photo.jpg");
  assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
  assert.equal(signed.headers["content-type"], "image/jpeg");
  assert.equal(url.searchParams.has("X-Amz-Signature"), true);

  const dateStamp = "20261113";
  const scope = `${dateStamp}//s3/aws4_request`;
  const entries = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "X-Amz-Signature")
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : 0) || (av < bv ? -1 : av > bv ? 1 : 0));
  const query = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const canonicalRequest = [
    "PUT",
    url.pathname,
    query,
    `content-length:12345\ncontent-type:image/jpeg\nhost:${url.host}\n`,
    "content-length;content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    "20261113T123456Z",
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac("AWS4test-secret", dateStamp);
  const regionKey = hmac(dateKey, "");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const expected = hmac(signingKey, stringToSign).toString("hex");
  assert.equal(url.searchParams.get("X-Amz-Signature"), expected);
  assert.equal(liaraObjectUrl("properties/uploads/front photo.jpg"), url.origin + url.pathname);
});

test("direct uploads stay disabled unless explicitly enabled with complete Liara credentials", () => {
  configureLiara();
  assert.equal(liaraDirectUploadEnabled(), true);
  process.env.LIARA_DIRECT_UPLOAD_ENABLED = "false";
  assert.equal(liaraDirectUploadEnabled(), false);
  process.env.LIARA_DIRECT_UPLOAD_ENABLED = "true";
  delete process.env.LIARA_SECRET_KEY;
  assert.equal(liaraDirectUploadEnabled(), false);
});

test("Liara HEAD exposes server-verified object size and content type", async () => {
  configureLiara();
  globalThis.fetch = (async (input, init) => {
    assert.equal((input as URL).pathname, "/hirmand-test/music/song.mp3");
    assert.equal(init?.method, "HEAD");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
    return new Response(null, {
      status: 200,
      headers: { "content-length": "1234", "content-type": "audio/mpeg", etag: '"abc"' },
    });
  }) as typeof fetch;
  try {
    assert.deepEqual(await headLiaraObject("music/song.mp3"), {
      sizeBytes: 1234,
      contentType: "audio/mpeg",
      etag: '"abc"',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Liara server-side copy signs the staging source and rejects embedded S3 error responses", async () => {
  configureLiara();
  let sourceHeader = "";
  globalThis.fetch = (async (input, init) => {
    assert.equal((input as URL).pathname, "/hirmand-test/properties/uploads/final.jpg");
    assert.equal(init?.method, "PUT");
    const headers = new Headers(init?.headers);
    sourceHeader = headers.get("x-amz-copy-source") ?? "";
    assert.match(headers.get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
    return new Response("<CopyObjectResult><ETag>abc</ETag></CopyObjectResult>", { status: 200 });
  }) as typeof fetch;
  try {
    assert.equal(await copyLiaraObject("staging/properties/uploads/final.jpg", "properties/uploads/final.jpg"), true);
    assert.equal(sourceHeader, "/hirmand-test/staging/properties/uploads/final.jpg");
    globalThis.fetch = (async () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 200 })) as typeof fetch;
    assert.equal(await copyLiaraObject("staging/a.jpg", "properties/uploads/a.jpg"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Liara ListObjectsV2 inventory paginates and decodes continuation tokens", async () => {
  configureLiara();
  const requests: URL[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = input as URL;
    requests.push(new URL(url.toString()));
    assert.equal(init?.method, "GET");
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^AWS4-HMAC-SHA256 /);
    if (requests.length === 1) {
      return new Response(
        "<ListBucketResult><Contents><Key>a</Key><Size>100</Size></Contents><Contents><Key>b</Key><Size>200</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;token</NextContinuationToken></ListBucketResult>",
        { status: 200 },
      );
    }
    return new Response(
      "<ListBucketResult><Contents><Key>c</Key><Size>300</Size></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const result = await listLiaraObjectInventory(2);
    assert.deepEqual(result, { objectCount: 3, totalBytes: 600, complete: true, pagesScanned: 2 });
    assert.equal(requests[0]?.searchParams.get("list-type"), "2");
    assert.equal(requests[1]?.searchParams.get("continuation-token"), "next&token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Liara inventory marks a page-limited scan incomplete instead of reporting a false total", async () => {
  configureLiara();
  globalThis.fetch = (async () => new Response(
    "<ListBucketResult><Contents><Key>a</Key><Size>100</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken></ListBucketResult>",
    { status: 200 },
  )) as typeof fetch;
  try {
    assert.deepEqual(await listLiaraObjectInventory(1), {
      objectCount: 1,
      totalBytes: 100,
      complete: false,
      pagesScanned: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Liara inventory rejects malformed object sizes instead of reporting a complete partial total", async () => {
  configureLiara();
  globalThis.fetch = (async () => new Response(
    "<ListBucketResult><Contents><Key>a</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
    { status: 200 },
  )) as typeof fetch;
  try {
    await assert.rejects(listLiaraObjectInventory(1), /without a valid Size/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Liara inventory rejects an oversized response before parsing a partial total", async () => {
  configureLiara();
  globalThis.fetch = (async () => new Response(
    "<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>",
    { status: 200, headers: { "content-length": String(4 * 1024 * 1024 + 1) } },
  )) as typeof fetch;
  try {
    await assert.rejects(listLiaraObjectInventory(1), /response-size limit/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
