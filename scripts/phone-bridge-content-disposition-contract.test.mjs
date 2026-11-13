import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("server/routes/api/admin/phone-bridge/files/[id].get.ts", "utf8");

test("Phone Bridge file downloads use the RFC 5987 Content-Disposition builder", () => {
  assert.match(route, /buildPhoneBridgeAttachmentContentDisposition/);
  assert.match(route, /"content-disposition",[\s\S]*?buildPhoneBridgeAttachmentContentDisposition\(row\.name\)/);
  assert.doesNotMatch(route, /encodeURIComponent\(safeDownloadName\(row\.name\)\)/);
});