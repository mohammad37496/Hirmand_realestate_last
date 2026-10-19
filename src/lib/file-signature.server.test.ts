import assert from "node:assert/strict";
import test from "node:test";
import { contentMatchesDeclaredType, sniffMediaBytes } from "./file-signature.server.ts";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = new TextEncoder().encode("RIFF1234WEBPVP8 ");
const gif = new TextEncoder().encode("GIF89a");
const avif = new TextEncoder().encode("0000ftypavif0000");
const mp4 = new TextEncoder().encode("0000ftypisom0000");
const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x93]);

test("accepted image containers match their declared MIME type", () => {
  assert.equal(contentMatchesDeclaredType(jpeg, "image/jpeg"), true);
  assert.equal(contentMatchesDeclaredType(png, "image/png"), true);
  assert.equal(contentMatchesDeclaredType(webp, "image/webp"), true);
  assert.equal(contentMatchesDeclaredType(gif, "image/gif"), true);
  assert.equal(contentMatchesDeclaredType(avif, "image/avif"), true);
});

test("accepted video containers are sniffed and type mismatches are refused", () => {
  assert.equal(contentMatchesDeclaredType(mp4, "video/mp4"), true);
  assert.equal(contentMatchesDeclaredType(webm, "video/webm"), true);
  assert.equal(contentMatchesDeclaredType(jpeg, "image/png"), false);
  assert.equal(contentMatchesDeclaredType(new TextEncoder().encode("<html>bad</html>"), "image/jpeg"), false);
  assert.equal(sniffMediaBytes(new Uint8Array()).ok, false);
});
