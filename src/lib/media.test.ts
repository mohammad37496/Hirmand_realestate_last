import assert from "node:assert/strict";
import test from "node:test";
import { isLiaraStorageHost, mediaSourceCandidates } from "./media.ts";
import { liaraObjectKeyFromUrl } from "./liara-object-storage.server.ts";
import { liaraRangeNotSatisfiableHeaders } from "./music-range-response.ts";

test("Liara object URLs use the signed same-origin media proxy", () => {
  const source = "https://storage.c2.liara.space/hirmand/properties/uploads/home.webp";
  assert.equal(isLiaraStorageHost(source), true);
  assert.deepEqual(mediaSourceCandidates(source, "/images/type-apartment.jpg"), [
    "/api/media-proxy?url=" + encodeURIComponent(source),
  ]);
});

test("only Liara storage hosts are classified for signed proxying", () => {
  assert.equal(isLiaraStorageHost("https://example.com/properties/home.webp"), false);
  assert.equal(isLiaraStorageHost("http://storage.c2.liara.space/bucket/image.webp"), false);
  assert.equal(isLiaraStorageHost("https://liara.space/image.webp"), true);
  assert.equal(isLiaraStorageHost("https://storage.c2.liara.site/hirmand-realestate/properties/home.webp"), true);
  assert.equal(isLiaraStorageHost("https://storage.c2.liara.site.evil.example/home.webp"), false);
});

test("non-Liara, non-Divar media keeps its original source first", () => {
  const source = "https://cdn.example.com/properties/home.webp";
  assert.deepEqual(mediaSourceCandidates(source, "/images/type-apartment.jpg"), [source]);
});


test("legacy .liara.site property URLs resolve to the configured bucket key", () => {
  const keys = ["LIARA_ENDPOINT", "LIARA_BUCKET_NAME", "LIARA_ACCESS_KEY", "LIARA_SECRET_KEY"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.LIARA_ENDPOINT = "https://storage.c2.liara.space";
  process.env.LIARA_BUCKET_NAME = "hirmand-realestate";
  process.env.LIARA_ACCESS_KEY = "test-access-key";
  process.env.LIARA_SECRET_KEY = "test-secret-key";
  try {
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site/hirmand-realestate/properties/uploads/gallery/photo.webp"),
      "properties/uploads/gallery/photo.webp",
    );
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site/another-bucket/photo.webp"),
      null,
    );
    assert.equal(
      liaraObjectKeyFromUrl("https://storage.c2.liara.site.evil.example/hirmand-realestate/photo.webp"),
      null,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});


test("legacy stored Liara proxy paths are normalized to the current same-origin route", () => {
  const target = "https://storage.c2.liara.site/hirmand-realestate/properties/uploads/legacy.webp";
  const expected = ["/api/media-proxy?url=" + encodeURIComponent(target)];
  assert.deepEqual(
    mediaSourceCandidates("/api/liara-media?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
    expected,
  );
  assert.deepEqual(
    mediaSourceCandidates("/api/media-proxy?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
    expected,
  );
  for (const origin of ["https://hirmandrealestate.ir", "https://www.hirmandrealestate.ir"]) {
    assert.deepEqual(
      mediaSourceCandidates(origin + "/api/liara-media?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
      expected,
    );
    assert.deepEqual(
      mediaSourceCandidates(origin + "/api/media-proxy?url=" + encodeURIComponent(target), "/images/type-apartment.jpg"),
      expected,
    );
  }
  const hostile = "https://evil.example/api/liara-media?url=" + encodeURIComponent(target);
  assert.deepEqual(
    mediaSourceCandidates(hostile, "/images/type-apartment.jpg"),
    [hostile],
  );
  const invalidTarget = "/api/liara-media?url=" + encodeURIComponent("https://evil.example/photo.webp");
  assert.deepEqual(
    mediaSourceCandidates(invalidTarget, "/images/type-apartment.jpg"),
    [invalidTarget],
  );
});

test("Liara music 416 responses preserve Content-Range and bypass shared caches", () => {
  const headers = liaraRangeNotSatisfiableHeaders(
    new Response(null, {
      status: 416,
      headers: {
        "accept-ranges": "bytes",
        "content-range": "bytes */12345",
      },
    }),
  );

  assert.deepEqual(headers, {
    "accept-ranges": "bytes",
    "content-range": "bytes */12345",
    "cache-control": "no-store",
    "content-disposition": "inline",
  });
  assert.equal(
    liaraRangeNotSatisfiableHeaders(new Response(null, { status: 404 })),
    null,
  );
});
