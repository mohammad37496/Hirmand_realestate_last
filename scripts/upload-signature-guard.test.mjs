import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const mediaStore = fs.readFileSync(new URL("../src/lib/media-store.server.ts", import.meta.url), "utf8");
const chunkedUpload = fs.readFileSync(new URL("../src/lib/chunked-upload.server.ts", import.meta.url), "utf8");

test("assembled media is validated after transformation and before public object-store offload", () => {
  const validator = mediaStore.indexOf("if (input.validateBeforeStore)");
  const objectStore = mediaStore.indexOf("// With an object store configured, move the finished file");
  assert.ok(validator >= 0, "the assembled upload must call the pre-store validator");
  assert.ok(objectStore > validator, "public object-store offload must follow signature validation");
  assert.match(mediaStore.slice(validator, objectStore), /await input\.validateBeforeStore\(/);
});

test("chunked upload validates actual bytes rather than trusting filename or declared MIME", () => {
  assert.match(chunkedUpload, /validateBeforeStore:\s*async \(\{ data, contentType \}\)/);
  assert.match(chunkedUpload, /contentMatchesDeclaredType\(data\.subarray\(0, SIGNATURE_PROBE_BYTES\), contentType\)/);
  assert.match(chunkedUpload, /signatureRejection\("محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد\./);
});
