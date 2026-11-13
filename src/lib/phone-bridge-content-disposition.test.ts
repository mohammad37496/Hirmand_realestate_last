import assert from "node:assert/strict";
import test from "node:test";
import { buildPhoneBridgeAttachmentContentDisposition, safePhoneBridgeDownloadName } from "./phone-bridge-content-disposition.ts";

test("RFC 5987 filename* percent-encodes characters excluded from attr-char and preserves Unicode", () => {
  const name = "آپارتمان's (final)*.pdf";
  const header = buildPhoneBridgeAttachmentContentDisposition(name);
  const encoded = header.split("filename*=UTF-8''")[1];

  assert.ok(encoded);
  assert.match(header, /^attachment; filename="phone-bridge-file"; filename\*=UTF-8''/);
  assert.equal(decodeURIComponent(encoded), name);
  assert.match(encoded, /%27/);
  assert.match(encoded, /%28/);
  assert.match(encoded, /%29/);
  assert.match(encoded, /%2A/);
  assert.doesNotMatch(encoded, /['()*]/);
});

test("download filename sanitization prevents CRLF and path separators from entering the header", () => {
  const name = "folder\\safe\r\nInjected: true.txt";
  assert.equal(safePhoneBridgeDownloadName(name), "folder-safe--Injected: true.txt");
  const header = buildPhoneBridgeAttachmentContentDisposition(name);
  assert.doesNotMatch(header, /[\r\n]/);
  assert.equal(decodeURIComponent(header.split("filename*=UTF-8''")[1]), "folder-safe--Injected: true.txt");
});