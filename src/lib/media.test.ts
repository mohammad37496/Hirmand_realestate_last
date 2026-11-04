import assert from "node:assert/strict";
import test from "node:test";
import { isLiaraStorageHost, mediaSourceCandidates } from "./media.ts";

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
