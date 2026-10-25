import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  isAllowedLiaraMediaKey,
  liaraMediaProxyUrl,
  putLiaraObjectFromFile,
} from "./liara-object-storage.server.ts";

test("Divar image objects are served through the same-origin Liara media proxy", () => {
  const previousEnv = {
    endpoint: process.env.LIARA_ENDPOINT,
    bucket: process.env.LIARA_BUCKET_NAME,
    access: process.env.LIARA_ACCESS_KEY,
    secret: process.env.LIARA_SECRET_KEY,
  };
  try {
    process.env.LIARA_ENDPOINT = "https://storage.example.test";
    process.env.LIARA_BUCKET_NAME = "hirmand-test-bucket";
    process.env.LIARA_ACCESS_KEY = "test-access-key";
    process.env.LIARA_SECRET_KEY = "test-secret-key";
    const source = "https://storage.example.test/hirmand-test-bucket/properties/divar/token/01-photo.webp";
    assert.equal(isAllowedLiaraMediaKey("properties/divar/token/01-photo.webp"), true);
    assert.equal(
      liaraMediaProxyUrl(source, "image/webp"),
      "/api/liara-media?url=" + encodeURIComponent(source),
    );
  } finally {
    if (previousEnv.endpoint === undefined) delete process.env.LIARA_ENDPOINT;
    else process.env.LIARA_ENDPOINT = previousEnv.endpoint;
    if (previousEnv.bucket === undefined) delete process.env.LIARA_BUCKET_NAME;
    else process.env.LIARA_BUCKET_NAME = previousEnv.bucket;
    if (previousEnv.access === undefined) delete process.env.LIARA_ACCESS_KEY;
    else process.env.LIARA_ACCESS_KEY = previousEnv.access;
    if (previousEnv.secret === undefined) delete process.env.LIARA_SECRET_KEY;
    else process.env.LIARA_SECRET_KEY = previousEnv.secret;
  }
});

test("Liara disk uploads use bounded multipart parts and complete the object", async () => {
  const previousEnv = {
    endpoint: process.env.LIARA_ENDPOINT,
    bucket: process.env.LIARA_BUCKET_NAME,
    access: process.env.LIARA_ACCESS_KEY,
    secret: process.env.LIARA_SECRET_KEY,
  };
  const originalFetch = globalThis.fetch;
  const workDir = await mkdtemp(join(tmpdir(), "hirmand-liara-multipart-test-"));
  const filePath = join(workDir, "test.bin");
  const partSizes: number[] = [];
  const methods: string[] = [];

  try {
    process.env.LIARA_ENDPOINT = "https://storage.example.test";
    process.env.LIARA_BUCKET_NAME = "hirmand-test-bucket";
    process.env.LIARA_ACCESS_KEY = "test-access-key";
    process.env.LIARA_SECRET_KEY = "test-secret-key";
    await writeFile(filePath, Buffer.alloc(9 * 1024 * 1024, 0x5a));

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = input instanceof Request ? input.url : String(input);
      const url = new URL(rawUrl);
      const method = String(init?.method ?? "GET").toUpperCase();
      methods.push(`${method} ${url.search}`);

      if (method === "POST" && url.searchParams.has("uploads")) {
        return new Response(
          "<InitiateMultipartUploadResult><UploadId>test-upload-id</UploadId></InitiateMultipartUploadResult>",
          { status: 200, headers: { "content-type": "application/xml" } },
        );
      }
      if (method === "PUT" && url.searchParams.has("partNumber")) {
        const partNumber = Number(url.searchParams.get("partNumber"));
        const body = init?.body;
        const length = body instanceof ArrayBuffer
          ? body.byteLength
          : ArrayBuffer.isView(body)
            ? body.byteLength
            : 0;
        partSizes.push(length);
        return new Response(null, {
          status: 200,
          headers: { etag: `"test-etag-${partNumber}"` },
        });
      }
      if (method === "POST" && url.searchParams.has("uploadId")) {
        return new Response("<CompleteMultipartUploadResult/>", { status: 200 });
      }
      if (method === "DELETE" && url.searchParams.has("uploadId")) {
        return new Response(null, { status: 204 });
      }
      return new Response("Unexpected multipart request", { status: 500 });
    }) as typeof fetch;

    const result = await putLiaraObjectFromFile({
      key: "properties/uploads/gallery/test.bin",
      filePath,
      contentType: "application/octet-stream",
    });

    assert.equal(
      result,
      "https://storage.example.test/hirmand-test-bucket/properties/uploads/gallery/test.bin",
    );
    assert.deepEqual(partSizes, [8 * 1024 * 1024, 1 * 1024 * 1024]);
    assert.equal(methods.filter((entry) => entry.startsWith("PUT ")).length, 2);
    assert.ok(methods.some((entry) => entry.startsWith("POST ") && entry.includes("uploads=")));
    assert.ok(methods.some((entry) => entry.startsWith("POST ") && entry.includes("uploadId=")));
    assert.ok(methods.every((entry) => !entry.includes("test-secret-key")));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.endpoint === undefined) delete process.env.LIARA_ENDPOINT;
    else process.env.LIARA_ENDPOINT = previousEnv.endpoint;
    if (previousEnv.bucket === undefined) delete process.env.LIARA_BUCKET_NAME;
    else process.env.LIARA_BUCKET_NAME = previousEnv.bucket;
    if (previousEnv.access === undefined) delete process.env.LIARA_ACCESS_KEY;
    else process.env.LIARA_ACCESS_KEY = previousEnv.access;
    if (previousEnv.secret === undefined) delete process.env.LIARA_SECRET_KEY;
    else process.env.LIARA_SECRET_KEY = previousEnv.secret;
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
